import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

// APS-2-7 safety guard — refuse to run if DATABASE_URL points at production.
// The 20:42 KST incident (5 projects wiped) happened because tests connected
// to the production Neon branch. vitest.config.ts now loads .env.test which
// overrides DATABASE_URL to a dedicated test branch; this guard is the
// defense-in-depth check that catches misconfiguration before any query runs.
const dbUrl = process.env.DATABASE_URL ?? '';
if (!dbUrl) {
  throw new Error(
    'APS-2-7 SAFETY: DATABASE_URL is not set. Create .env.test at repo root pointing to a dedicated test database.',
  );
}
// Compute hosts for the production branch (br-billowing-heart-aozi9xug). Update
// this list if Neon recreates the production endpoint. Verified via the Neon MCP
// `list_branch_computes` tool on 2026-05-18 during the APS-2-7 incident recovery.
const PROD_COMPUTE_HOSTS = [
  'ep-old-haze-aol2r7dt.c-2.ap-southeast-1.aws.neon.tech',
  'ep-old-haze-aol2r7dt-pooler.c-2.ap-southeast-1.aws.neon.tech',
];
if (PROD_COMPUTE_HOSTS.some((host) => dbUrl.includes(host))) {
  throw new Error(
    'APS-2-7 SAFETY: DATABASE_URL points at the production Neon compute ' +
    '(ep-old-haze-aol2r7dt). Tests must use a dedicated branch endpoint via .env.test ' +
    '(loaded by vitest.config.ts). See the SAFETY block below for context.',
  );
}

let ContextService: typeof import('../services/context-service.js').ContextService;
let ProjectRepository: typeof import('../db/repositories/project-repo.js').ProjectRepository;
let EpicRepository: typeof import('../db/repositories/epic-repo.js').EpicRepository;
let TaskRepository: typeof import('../db/repositories/task-repo.js').TaskRepository;
let runMigrations: typeof import('../db/migrate.js').runMigrations;
let closeDb: typeof import('../db/connection.js').closeDb;
let getPool: typeof import('../db/connection.js').getPool;

beforeAll(async () => {
  const migrate = await import('../db/migrate.js');
  const conn = await import('../db/connection.js');
  const ctxMod = await import('../services/context-service.js');
  const projectMod = await import('../db/repositories/project-repo.js');
  const epicMod = await import('../db/repositories/epic-repo.js');
  const taskMod = await import('../db/repositories/task-repo.js');

  runMigrations = migrate.runMigrations;
  closeDb = conn.closeDb;
  getPool = conn.getPool;
  ContextService = ctxMod.ContextService;
  ProjectRepository = projectMod.ProjectRepository;
  EpicRepository = epicMod.EpicRepository;
  TaskRepository = taskMod.TaskRepository;

  await runMigrations();
});

afterAll(() => {
  closeDb();
});

// SAFETY: DO NOT add unscoped DELETE statements here. This suite connects to a
// real Neon database when DATABASE_URL is loaded from .env during local test
// execution. An unscoped `DELETE FROM projects` previously wiped production
// (APS-2-7 incident). Cleanup is now scoped to the project IDs we created in
// each test via the tracker below, and runs in child→parent order because
// `tasks.epic_id` is `ON DELETE SET NULL` (not CASCADE) — deleting only
// `projects` would leave orphan task rows behind.
const createdProjectIds: string[] = [];

async function seedProjectWithEpic() {
  const projectRepo = new ProjectRepository();
  const epicRepo = new EpicRepository();
  const project = await projectRepo.create({ name: 'ContextSvc Test Project' });
  createdProjectIds.push(project.id);
  const epic = await epicRepo.create({ project_id: project.id, title: 'ContextSvc Epic' });
  return { projectId: project.id, epicId: epic.id };
}

afterEach(async () => {
  if (createdProjectIds.length === 0) return;
  const ids = [...createdProjectIds];
  // Transactional cleanup so a partial failure does not leave orphans. We keep
  // the IDs in `createdProjectIds` until COMMIT succeeds so a retried run can
  // still find them. Child→parent ordering matters because tasks.epic_id is
  // ON DELETE SET NULL (not CASCADE), and activity_log.task_id is also
  // ON DELETE SET NULL so we must purge activity_log rows first.
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM activity_log WHERE task_id IN (
         SELECT id FROM tasks WHERE epic_id IN (
           SELECT id FROM epics WHERE project_id = ANY($1::text[])
         )
       )`,
      [ids],
    );
    await client.query(
      'DELETE FROM tasks WHERE epic_id IN (SELECT id FROM epics WHERE project_id = ANY($1::text[]))',
      [ids],
    );
    await client.query('DELETE FROM epics WHERE project_id = ANY($1::text[])', [ids]);
    await client.query('DELETE FROM projects WHERE id = ANY($1::text[])', [ids]);
    await client.query('COMMIT');
    createdProjectIds.length = 0; // only clear tracker after the commit succeeds
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
});

describe('ContextService.getSessionContext — recentlyCompleted sort regression (APS-2-7)', () => {
  it('sorts done tasks by completed_at descending when timestamps come back as Date objects', async () => {
    const { projectId, epicId } = await seedProjectWithEpic();
    const taskRepo = new TaskRepository();

    const older = await taskRepo.create({ epic_id: epicId, title: 'older done' });
    const newer = await taskRepo.create({ epic_id: epicId, title: 'newer done' });

    // Force differing completed_at values via direct UPDATE so we can assert ordering.
    await getPool().query(
      'UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3',
      ['done', '2026-01-01T00:00:00.000Z', older.id],
    );
    await getPool().query(
      'UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3',
      ['done', '2026-05-01T00:00:00.000Z', newer.id],
    );

    const service = new ContextService();
    const ctx = await service.getSessionContext(projectId);

    expect(ctx.recentlyCompleted.tasks).toHaveLength(2);
    // Must NOT throw 'bTime.localeCompare is not a function' even if pg returns Date.
    expect(ctx.recentlyCompleted.tasks[0].id).toBe(newer.id);
    expect(ctx.recentlyCompleted.tasks[1].id).toBe(older.id);
    expect(ctx.recentlyCompleted.lastCompletedAt).not.toBeNull();
  });

  it('falls back to created_at when completed_at is null and still sorts correctly', async () => {
    const { projectId, epicId } = await seedProjectWithEpic();
    const taskRepo = new TaskRepository();

    const a = await taskRepo.create({ epic_id: epicId, title: 'done a' });
    const b = await taskRepo.create({ epic_id: epicId, title: 'done b' });

    // Both marked done but with NULL completed_at — sort must fall through to created_at safely.
    await getPool().query('UPDATE tasks SET status = $1, created_at = $2 WHERE id = $3', ['done', '2026-02-01T00:00:00.000Z', a.id]);
    await getPool().query('UPDATE tasks SET status = $1, created_at = $2 WHERE id = $3', ['done', '2026-04-01T00:00:00.000Z', b.id]);

    const service = new ContextService();
    const ctx = await service.getSessionContext(projectId);

    expect(ctx.recentlyCompleted.tasks.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it('caps recentlyCompleted to 5 entries', async () => {
    const { projectId, epicId } = await seedProjectWithEpic();
    const taskRepo = new TaskRepository();

    for (let i = 0; i < 7; i++) {
      const t = await taskRepo.create({ epic_id: epicId, title: `done ${i}` });
      const iso = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      await getPool().query('UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3', ['done', iso, t.id]);
    }

    const service = new ContextService();
    const ctx = await service.getSessionContext(projectId);
    expect(ctx.recentlyCompleted.tasks).toHaveLength(5);
  });
});
