import { getDb } from './connection.js';
import { generateProjectCode } from '../utils/code-gen.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active', 'archived')),
  github_repo TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS epics (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK(status IN ('todo', 'in_progress', 'done')),
  priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(project_id);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  epic_id       TEXT REFERENCES epics(id) ON DELETE SET NULL,
  parent_id     TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'todo'
                CHECK(status IN ('todo', 'in_progress', 'testing', 'fixing', 'review', 'done', 'blocked')),
  priority      INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  assignee      TEXT NOT NULL DEFAULT 'ai',
  github_issue  TEXT,
  github_pr     TEXT,
  estimated_hrs REAL,
  actual_hrs    REAL,
  blocked_by    TEXT,
  created_by    TEXT NOT NULL DEFAULT 'human'
                CHECK(created_by IN ('ai', 'human')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on),
  CHECK(task_id != depends_on)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  actor      TEXT NOT NULL CHECK(actor IN ('ai', 'human', 'github')),
  action     TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_task ON activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

CREATE TABLE IF NOT EXISTS test_runs (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_number   INTEGER NOT NULL,
  test_type    TEXT NOT NULL
               CHECK(test_type IN ('unit', 'type', 'lint', 'integration', 'build')),
  status       TEXT NOT NULL
               CHECK(status IN ('pass', 'fail', 'skip')),
  output       TEXT,
  failures     TEXT,
  duration_ms  INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_test_runs_task ON test_runs(task_id);

CREATE TABLE IF NOT EXISTS fix_attempts (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt_number  INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 3),
  trigger_run_id  TEXT REFERENCES test_runs(id),
  files_changed   TEXT,
  fix_description TEXT,
  result_status   TEXT NOT NULL
                  CHECK(result_status IN ('pass', 'fail', 'escalated')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fix_attempts_task ON fix_attempts(task_id);
`;

const MIGRATIONS = [
  // v2: Add ticket code system (code, seq, ticket_code)
  {
    id: 'v2_ticket_codes',
    sql: `
      ALTER TABLE projects ADD COLUMN code TEXT;
      ALTER TABLE epics ADD COLUMN seq INTEGER;
      ALTER TABLE tasks ADD COLUMN seq INTEGER;
      ALTER TABLE tasks ADD COLUMN ticket_code TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code ON projects(code) WHERE code IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_ticket_code ON tasks(ticket_code) WHERE ticket_code IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_epic_seq ON tasks(epic_id, seq) WHERE epic_id IS NOT NULL AND seq IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_epics_project_seq ON epics(project_id, seq) WHERE seq IS NOT NULL;
    `,
    backfill: (db: ReturnType<typeof getDb>) => {
      // Backfill project codes from existing names
      const projects = db.prepare('SELECT id, name FROM projects WHERE code IS NULL').all() as { id: string; name: string }[];
      for (const p of projects) {
        const code = generateProjectCode(p.name);
        let finalCode = code;
        let suffix = 1;
        while (db.prepare('SELECT 1 FROM projects WHERE code = ? AND id != ?').get(finalCode, p.id)) {
          if (suffix > 999) break;
          finalCode = `${code}${suffix++}`;
        }
        db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(finalCode, p.id);
      }
      // Backfill epic seq
      const epicsByProject = db.prepare('SELECT id, project_id FROM epics WHERE seq IS NULL ORDER BY order_index').all() as { id: string; project_id: string }[];
      const epicSeqMap = new Map<string, number>();
      for (const e of epicsByProject) {
        const nextSeq = (epicSeqMap.get(e.project_id) ?? 0) + 1;
        epicSeqMap.set(e.project_id, nextSeq);
        db.prepare('UPDATE epics SET seq = ? WHERE id = ?').run(nextSeq, e.id);
      }
      // Backfill task seq and ticket_code
      const tasks = db.prepare(`
        SELECT t.id, t.epic_id, e.seq as epic_seq, p.code as project_code
        FROM tasks t
        LEFT JOIN epics e ON t.epic_id = e.id
        LEFT JOIN projects p ON e.project_id = p.id
        WHERE t.seq IS NULL
        ORDER BY t.created_at
      `).all() as { id: string; epic_id: string | null; epic_seq: number | null; project_code: string | null }[];
      const taskSeqMap = new Map<string, number>();
      for (const t of tasks) {
        const epicKey = t.epic_id ?? '__orphan__';
        const nextSeq = (taskSeqMap.get(epicKey) ?? 0) + 1;
        taskSeqMap.set(epicKey, nextSeq);
        const ticketCode = t.project_code && t.epic_seq
          ? `${t.project_code}-${t.epic_seq}-${nextSeq}`
          : null;
        db.prepare('UPDATE tasks SET seq = ?, ticket_code = ? WHERE id = ?').run(nextSeq, ticketCode, t.id);
      }
    },
  },
];

export function runMigrations(): void {
  const db = getDb();
  db.exec(SCHEMA);

  // Ensure migrations tracking table
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');

  for (const migration of MIGRATIONS) {
    const applied = db.prepare('SELECT 1 FROM _migrations WHERE id = ?').get(migration.id);
    if (applied) continue;

    const runMigration = db.transaction(() => {
      db.exec(migration.sql);
      if (migration.backfill) migration.backfill(db);
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id);
    });
    runMigration();
  }
}
