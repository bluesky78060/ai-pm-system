import { getPool } from './connection.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active', 'archived')),
  github_repo TEXT,
  code        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code ON projects(code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS epics (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK(status IN ('todo', 'in_progress', 'done')),
  priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  order_index INTEGER NOT NULL DEFAULT 0,
  seq         INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_epics_project_seq ON epics(project_id, seq) WHERE seq IS NOT NULL;

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
  seq           INTEGER,
  ticket_code   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_ticket_code ON tasks(ticket_code) WHERE ticket_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_epic_seq ON tasks(epic_id, seq) WHERE epic_id IS NOT NULL AND seq IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on),
  CHECK(task_id != depends_on)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         SERIAL PRIMARY KEY,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  actor      TEXT NOT NULL CHECK(actor IN ('ai', 'human', 'github', 'system')),
  action     TEXT NOT NULL,
  payload    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fix_attempts_task ON fix_attempts(task_id);

CREATE TABLE IF NOT EXISTS automation_rules (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  trigger_event TEXT NOT NULL CHECK(trigger_event IN ('epic_completed', 'task_stale', 'all_tests_pass', 'status_change')),
  condition     TEXT,
  action_type   TEXT NOT NULL CHECK(action_type IN ('notify', 'auto_transition', 'create_task')),
  action_config TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_project ON automation_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON automation_rules(trigger_event);
`;

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Execute each statement separately to handle "already exists" gracefully
  const statements = SCHEMA.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      // 42P07 = relation already exists, 42710 = index already exists
      if (pgErr.code === '42P07' || pgErr.code === '42710') continue;
      throw err;
    }
  }
}
