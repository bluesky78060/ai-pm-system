import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

// APS-5-1 safety guard — refuse to run if DATABASE_URL points at production.
// Mirrors the guard in context-service.test.ts (APS-2-7 incident reference).
const dbUrl = process.env.DATABASE_URL ?? '';
if (!dbUrl) {
  throw new Error(
    'APS-5-1 SAFETY: DATABASE_URL is not set. Create .env.test at repo root pointing to a dedicated test database.',
  );
}
// Compute hosts for the production branch (br-billowing-heart-aozi9xug).
const PROD_COMPUTE_HOSTS = [
  'ep-old-haze-aol2r7dt.c-2.ap-southeast-1.aws.neon.tech',
  'ep-old-haze-aol2r7dt-pooler.c-2.ap-southeast-1.aws.neon.tech',
];
if (PROD_COMPUTE_HOSTS.some((host) => dbUrl.includes(host))) {
  throw new Error(
    'APS-5-1 SAFETY: DATABASE_URL points at the production Neon compute ' +
    '(ep-old-haze-aol2r7dt). Tests must use a dedicated branch endpoint via .env.test ' +
    '(loaded by vitest.config.ts).',
  );
}

// Dynamic imports
let TaskService: typeof import('../services/task-service.js').TaskService;
let TestService: typeof import('../services/test-service.js').TestService;
let ProjectRepository: typeof import('../db/repositories/project-repo.js').ProjectRepository;
let EpicRepository: typeof import('../db/repositories/epic-repo.js').EpicRepository;
let FixAttemptRepository: typeof import('../db/repositories/fix-attempt-repo.js').FixAttemptRepository;
let runMigrations: typeof import('../db/migrate.js').runMigrations;
let closeDb: typeof import('../db/connection.js').closeDb;
let getPool: typeof import('../db/connection.js').getPool;

beforeAll(async () => {
  const migrate = await import('../db/migrate.js');
  const conn = await import('../db/connection.js');
  const taskMod = await import('../services/task-service.js');
  const testMod = await import('../services/test-service.js');
  const projectMod = await import('../db/repositories/project-repo.js');
  const epicMod = await import('../db/repositories/epic-repo.js');
  const fixAttemptMod = await import('../db/repositories/fix-attempt-repo.js');

  runMigrations = migrate.runMigrations;
  closeDb = conn.closeDb;
  getPool = conn.getPool;
  TaskService = taskMod.TaskService;
  TestService = testMod.TestService;
  ProjectRepository = projectMod.ProjectRepository;
  EpicRepository = epicMod.EpicRepository;
  FixAttemptRepository = fixAttemptMod.FixAttemptRepository;

  await runMigrations();
});

afterAll(() => {
  closeDb();
});

// SAFETY: DO NOT add unscoped DELETE statements here. This suite connects to a
// real Neon database when DATABASE_URL is loaded from .env.test during local test
// execution. Cleanup is scoped to project IDs created in each test via the tracker
// below, and runs in child→parent order (activity_log → tasks → epics → projects).
const createdProjectIds: string[] = [];

// Helper: create a project and epic, return their IDs
async function createProjectAndEpic() {
  const projectRepo = new ProjectRepository();
  const epicRepo = new EpicRepository();

  const project = await projectRepo.create({ name: 'Test Project' });
  createdProjectIds.push(project.id);
  const epic = await epicRepo.create({ project_id: project.id, title: 'Test Epic' });

  return { projectId: project.id, epicId: epic.id };
}

afterEach(async () => {
  if (createdProjectIds.length === 0) return;
  const ids = [...createdProjectIds];
  // Transactional cleanup so a partial failure does not leave orphans.
  // Child→parent ordering: activity_log → tasks → epics → projects.
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
    createdProjectIds.length = 0; // only clear tracker after commit succeeds
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// TaskService.create
// ──────────────────────────────────────────────
describe('TaskService.create', () => {
  it('creates a task with required title', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();

    const result = await svc.create({ title: 'My Task', epic_id: epicId });

    expect(result.task).toBeDefined();
    expect(result.task.title).toBe('My Task');
    expect(result.task.epic_id).toBe(epicId);
    expect(result.task.status).toBe('todo');
    expect(result.message).toContain('My Task');
  });

  it('creates a task with optional fields', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();

    const result = await svc.create({
      title: 'Task With Options',
      epic_id: epicId,
      description: 'Some description',
      priority: 2,
      assignee: 'alice',
      estimated_hrs: 4,
      created_by: 'human',
    });

    expect(result.task.title).toBe('Task With Options');
    expect(result.task.priority).toBe(2);
    expect(result.task.assignee).toBe('alice');
    expect(result.task.estimated_hrs).toBe(4);
    expect(result.task.created_by).toBe('human');
  });

  it('returns a task without epic when epic_id is omitted', async () => {
    const svc = new TaskService();

    const result = await svc.create({ title: 'Standalone Task' });

    expect(result.task).toBeDefined();
    expect(result.task.title).toBe('Standalone Task');
    expect(result.task.epic_id).toBeNull();
  });
});

// ──────────────────────────────────────────────
// TaskService.updateStatus
// ──────────────────────────────────────────────
describe('TaskService.updateStatus', () => {
  it('transitions todo → in_progress', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 1', epic_id: epicId });

    const result = await svc.updateStatus(task.id, 'in_progress');

    expect(result.previousStatus).toBe('todo');
    expect(result.task.status).toBe('in_progress');
    expect(result.message).toContain('todo');
    expect(result.message).toContain('in_progress');
  });

  it('transitions in_progress → testing', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 2', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');

    const result = await svc.updateStatus(task.id, 'testing');

    expect(result.previousStatus).toBe('in_progress');
    expect(result.task.status).toBe('testing');
  });

  it('transitions testing → done is INVALID and throws', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 3', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');
    await svc.updateStatus(task.id, 'testing');

    await expect(svc.updateStatus(task.id, 'done')).rejects.toThrow();
  });

  it('transitions todo → done is INVALID and throws', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 4', epic_id: epicId });

    await expect(svc.updateStatus(task.id, 'done')).rejects.toThrow(/잘못된 상태 전환/);
  });

  it('transitions testing → review (valid via fixing path)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 5', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');
    await svc.updateStatus(task.id, 'testing');

    const result = await svc.updateStatus(task.id, 'review', undefined, { bypassGuard: true });

    expect(result.task.status).toBe('review');
  });

  it('transitions review → done', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 6', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');
    await svc.updateStatus(task.id, 'testing');
    await svc.updateStatus(task.id, 'review', undefined, { bypassGuard: true });

    const result = await svc.updateStatus(task.id, 'done', undefined, { bypassGuard: true });

    expect(result.task.status).toBe('done');
  });

  it('throws when task does not exist', async () => {
    const svc = new TaskService();

    await expect(svc.updateStatus('nonexistent-id', 'in_progress')).rejects.toThrow(/태스크를 찾을 수 없습니다/);
  });
});

// ──────────────────────────────────────────────
// TaskService.setPriority
// ──────────────────────────────────────────────
describe('TaskService.setPriority', () => {
  it('sets a valid priority (1)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 1', epic_id: epicId, priority: 3 });

    const result = await svc.setPriority(task.id, 1, 'urgent');

    expect(result.task.priority).toBe(1);
    expect(result.previousPriority).toBe(3);
    expect(result.message).toContain('1');
  });

  it('sets a valid priority (5)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 2', epic_id: epicId, priority: 1 });

    const result = await svc.setPriority(task.id, 5, 'low importance');

    expect(result.task.priority).toBe(5);
    expect(result.previousPriority).toBe(1);
  });

  it('sets a valid priority (3, midpoint)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 3', epic_id: epicId, priority: 1 });

    const result = await svc.setPriority(task.id, 3, 'rebalanced');

    expect(result.task.priority).toBe(3);
  });

  it('throws for priority 0 (below minimum)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 4', epic_id: epicId });

    await expect(svc.setPriority(task.id, 0, 'invalid')).rejects.toThrow(/우선순위는 1~5/);
  });

  it('throws for priority 6 (above maximum)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 5', epic_id: epicId });

    await expect(svc.setPriority(task.id, 6, 'invalid')).rejects.toThrow(/우선순위는 1~5/);
  });

  it('throws for negative priority', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 6', epic_id: epicId });

    await expect(svc.setPriority(task.id, -1, 'negative')).rejects.toThrow(/우선순위는 1~5/);
  });

  it('throws when task does not exist', async () => {
    const svc = new TaskService();

    await expect(svc.setPriority('nonexistent-id', 3, 'reason')).rejects.toThrow(/태스크를 찾을 수 없습니다/);
  });
});

// ──────────────────────────────────────────────
// TestService.reportTestResult
// ──────────────────────────────────────────────
describe('TestService.reportTestResult', () => {
  it('pass: sets task status to review', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();

    const { task } = await taskSvc.create({ title: 'Test Result Pass', epic_id: epicId });
    // Move task to testing so that the status change is valid at the repo level
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    const result = await testSvc.reportTestResult(task.id, 'pass');

    expect(result.task.status).toBe('review');
    expect(result.action).toBe('moved_to_review');
    expect(result.message).toContain('review');
  });

  it('fail with 0 prior attempts: sets task status to fixing', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();

    const { task } = await taskSvc.create({ title: 'Test Result Fail 1', epic_id: epicId });
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    const result = await testSvc.reportTestResult(task.id, 'fail', [
      { message: 'assertion failed at line 42' },
    ]);

    expect(result.task.status).toBe('fixing');
    expect(result.action).toBe('moved_to_fixing');
    expect(result.message).toContain('fixing');
  });

  it('fail with 2 prior attempts (< MAX): sets task status to fixing', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();
    const fixRepo = new FixAttemptRepository();

    const { task } = await taskSvc.create({ title: 'Test Result Fail 2', epic_id: epicId });
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    // Insert 2 existing fix attempts manually
    await fixRepo.create({ task_id: task.id, attempt_number: 1, result_status: 'fail' });
    await fixRepo.create({ task_id: task.id, attempt_number: 2, result_status: 'fail' });

    const result = await testSvc.reportTestResult(task.id, 'fail');

    expect(result.task.status).toBe('fixing');
    expect(result.action).toBe('moved_to_fixing');
  });

  it('fail with MAX (3) prior attempts: escalates to blocked', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();
    const fixRepo = new FixAttemptRepository();

    const { task } = await taskSvc.create({ title: 'Test Result Fail Escalate', epic_id: epicId });
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    // Insert 3 existing fix attempts (MAX_FIX_ATTEMPTS = 3)
    await fixRepo.create({ task_id: task.id, attempt_number: 1, result_status: 'fail' });
    await fixRepo.create({ task_id: task.id, attempt_number: 2, result_status: 'fail' });
    await fixRepo.create({ task_id: task.id, attempt_number: 3, result_status: 'fail' });

    const result = await testSvc.reportTestResult(task.id, 'fail');

    expect(result.task.status).toBe('blocked');
    expect(result.action).toBe('escalated');
    expect(result.message).toContain('에스컬레이션');
  });

  it('throws when task does not exist', async () => {
    const testSvc = new TestService();

    await expect(testSvc.reportTestResult('nonexistent-id', 'pass')).rejects.toThrow(/태스크를 찾을 수 없습니다/);
  });
});

// ──────────────────────────────────────────────
// WorkloadService.getWorkloadByAssignee
// ──────────────────────────────────────────────
describe('WorkloadService.getWorkloadByAssignee', () => {
  it('returns empty analysis for project with no tasks', async () => {
    const { projectId } = await createProjectAndEpic();
    const WorkloadService = (await import('../services/workload-service.js')).WorkloadService;
    const svc = new WorkloadService();

    const result = await svc.getWorkloadByAssignee(projectId);

    expect(result.project_id).toBe(projectId);
    expect(result.total_active_tasks).toBe(0);
    expect(result.all_assignees).toHaveLength(0);
    expect(result.overloaded_assignees).toHaveLength(0);
  });

  it('calculates workload for a single assignee with in_progress tasks', async () => {
    const { projectId, epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const WorkloadService = (await import('../services/workload-service.js')).WorkloadService;
    const workloadSvc = new WorkloadService();

    // Create and start a task assigned to alice
    const { task } = await taskSvc.create({
      title: 'Task 1',
      epic_id: epicId,
      assignee: 'alice',
      estimated_hrs: 5,
    });
    await taskSvc.updateStatus(task.id, 'in_progress');

    const result = await workloadSvc.getWorkloadByAssignee(projectId);

    expect(result.total_active_tasks).toBe(1);
    expect(result.all_assignees).toHaveLength(1);
    const alice = result.all_assignees[0];
    expect(alice.assignee).toBe('alice');
    expect(alice.in_progress_count).toBe(1);
    expect(alice.estimated_hours_total).toBe(5);
  });

  it('groups tasks by assignee and calculates stats', async () => {
    const { projectId, epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const WorkloadService = (await import('../services/workload-service.js')).WorkloadService;
    const workloadSvc = new WorkloadService();

    // Create tasks for alice (2 in_progress, 1 done)
    const task1 = await taskSvc.create({
      title: 'Alice Task 1',
      epic_id: epicId,
      assignee: 'alice',
      estimated_hrs: 4,
    });
    await taskSvc.updateStatus(task1.task.id, 'in_progress');

    const task2 = await taskSvc.create({
      title: 'Alice Task 2',
      epic_id: epicId,
      assignee: 'alice',
      estimated_hrs: 3,
    });
    await taskSvc.updateStatus(task2.task.id, 'in_progress');

    const task3 = await taskSvc.create({
      title: 'Alice Task 3',
      epic_id: epicId,
      assignee: 'alice',
      estimated_hrs: 2,
    });
    await taskSvc.updateStatus(task3.task.id, 'in_progress');
    await taskSvc.updateStatus(task3.task.id, 'testing');
    await taskSvc.updateStatus(task3.task.id, 'review', undefined, { bypassGuard: true });
    await taskSvc.updateStatus(task3.task.id, 'done', undefined, { bypassGuard: true });

    // Create task for bob (1 in_progress)
    const task4 = await taskSvc.create({
      title: 'Bob Task 1',
      epic_id: epicId,
      assignee: 'bob',
      estimated_hrs: 6,
    });
    await taskSvc.updateStatus(task4.task.id, 'in_progress');

    const result = await workloadSvc.getWorkloadByAssignee(projectId);

    expect(result.total_active_tasks).toBe(3);
    expect(result.all_assignees).toHaveLength(2);

    // alice should be first (2 tasks, 7 hours)
    const alice = result.all_assignees.find(a => a.assignee === 'alice');
    expect(alice).toBeDefined();
    expect(alice!.in_progress_count).toBe(2);
    expect(alice!.estimated_hours_total).toBe(7);
    expect(alice!.completed_count).toBe(1);
    expect(alice!.completion_rate).toBeCloseTo(1 / 3, 2);

    // bob should be second (1 task, 6 hours)
    const bob = result.all_assignees.find(a => a.assignee === 'bob');
    expect(bob).toBeDefined();
    expect(bob!.in_progress_count).toBe(1);
    expect(bob!.estimated_hours_total).toBe(6);
    expect(bob!.completed_count).toBe(0);
  });

  it('detects overloaded assignees (task count)', async () => {
    const { projectId, epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const WorkloadService = (await import('../services/workload-service.js')).WorkloadService;
    const workloadSvc = new WorkloadService();

    // Create 4 in_progress tasks for alice (threshold is 3)
    for (let i = 0; i < 4; i++) {
      const task = await taskSvc.create({
        title: `Alice Task ${i + 1}`,
        epic_id: epicId,
        assignee: 'alice',
        estimated_hrs: 2,
      });
      await taskSvc.updateStatus(task.task.id, 'in_progress');
    }

    const result = await workloadSvc.getWorkloadByAssignee(projectId);

    expect(result.overloaded_assignees).toHaveLength(1);
    expect(result.overloaded_assignees[0].assignee).toBe('alice');
  });

  it('detects overloaded assignees (estimated hours)', async () => {
    const { projectId, epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const WorkloadService = (await import('../services/workload-service.js')).WorkloadService;
    const workloadSvc = new WorkloadService();

    // Create 2 tasks for bob with 15 hours each (threshold is 20)
    for (let i = 0; i < 2; i++) {
      const task = await taskSvc.create({
        title: `Bob Task ${i + 1}`,
        epic_id: epicId,
        assignee: 'bob',
        estimated_hrs: 15,
      });
      await taskSvc.updateStatus(task.task.id, 'in_progress');
    }

    const result = await workloadSvc.getWorkloadByAssignee(projectId);

    expect(result.overloaded_assignees).toHaveLength(1);
    expect(result.overloaded_assignees[0].assignee).toBe('bob');
    expect(result.overloaded_assignees[0].estimated_hours_total).toBe(30);
  });

  it('calculates metrics correctly', async () => {
    const { projectId, epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const WorkloadService = (await import('../services/workload-service.js')).WorkloadService;
    const workloadSvc = new WorkloadService();

    // Create tasks: alice (2), bob (1), charlie (3)
    for (let i = 0; i < 2; i++) {
      const task = await taskSvc.create({
        title: `Alice Task ${i + 1}`,
        epic_id: epicId,
        assignee: 'alice',
      });
      await taskSvc.updateStatus(task.task.id, 'in_progress');
    }

    const task = await taskSvc.create({
      title: 'Bob Task 1',
      epic_id: epicId,
      assignee: 'bob',
    });
    await taskSvc.updateStatus(task.task.id, 'in_progress');

    for (let i = 0; i < 3; i++) {
      const t = await taskSvc.create({
        title: `Charlie Task ${i + 1}`,
        epic_id: epicId,
        assignee: 'charlie',
      });
      await taskSvc.updateStatus(t.task.id, 'in_progress');
    }

    const result = await workloadSvc.getWorkloadByAssignee(projectId);

    expect(result.metrics.max_workload).toBe(3);
    expect(result.metrics.min_workload).toBe(1);
    expect(result.metrics.avg_workload).toBeCloseTo(2, 1);
    expect(result.metrics.overload_threshold).toBe(3);
  });
});
