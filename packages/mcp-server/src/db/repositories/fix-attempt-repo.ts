import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { FixAttempt } from '../../types/index.js';

export class FixAttemptRepository {
  findById(id: string): FixAttempt | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM fix_attempts WHERE id = ?').get(id) as FixAttempt | undefined;
  }

  findByTask(taskId: string): FixAttempt[] {
    const db = getDb();
    return db.prepare('SELECT * FROM fix_attempts WHERE task_id = ? ORDER BY attempt_number DESC').all(taskId) as FixAttempt[];
  }

  getLatestAttemptNumber(taskId: string): number {
    const db = getDb();
    const row = db.prepare('SELECT COALESCE(MAX(attempt_number), 0) as max_attempt FROM fix_attempts WHERE task_id = ?').get(taskId) as { max_attempt: number };
    return row.max_attempt;
  }

  create(data: {
    task_id: string;
    attempt_number: number;
    trigger_run_id?: string;
    files_changed?: string;
    fix_description?: string;
    result_status: string;
  }): FixAttempt {
    const db = getDb();
    const id = uuid();
    db.prepare(`
      INSERT INTO fix_attempts (id, task_id, attempt_number, trigger_run_id, files_changed, fix_description, result_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.task_id,
      data.attempt_number,
      data.trigger_run_id ?? null,
      data.files_changed ?? null,
      data.fix_description ?? null,
      data.result_status,
    );
    return this.findById(id)!;
  }
}
