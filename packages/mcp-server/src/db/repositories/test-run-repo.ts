import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { TestRun } from '../../types/index.js';

export class TestRunRepository {
  findById(id: string): TestRun | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id) as TestRun | undefined;
  }

  findByTask(taskId: string): TestRun[] {
    const db = getDb();
    return db.prepare('SELECT * FROM test_runs WHERE task_id = ? ORDER BY run_number DESC, created_at DESC').all(taskId) as TestRun[];
  }

  getLatestRunNumber(taskId: string): number {
    const db = getDb();
    const row = db.prepare('SELECT COALESCE(MAX(run_number), 0) as max_run FROM test_runs WHERE task_id = ?').get(taskId) as { max_run: number };
    return row.max_run;
  }

  create(data: {
    task_id: string;
    run_number: number;
    test_type: string;
    status: string;
    output?: string;
    failures?: string;
    duration_ms?: number;
  }): TestRun {
    const db = getDb();
    const id = uuid();
    db.prepare(`
      INSERT INTO test_runs (id, task_id, run_number, test_type, status, output, failures, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.task_id,
      data.run_number,
      data.test_type,
      data.status,
      data.output ?? null,
      data.failures ?? null,
      data.duration_ms ?? null,
    );
    return this.findById(id)!;
  }

  countByTaskAndStatus(taskId: string): Record<string, number> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count FROM test_runs WHERE task_id = ? GROUP BY status
    `).all(taskId) as { status: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  }
}
