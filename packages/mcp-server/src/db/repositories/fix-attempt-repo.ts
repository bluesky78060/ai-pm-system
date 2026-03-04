import { v4 as uuid } from 'uuid';
import { getPool } from '../connection.js';
import type { FixAttempt } from '../../types/index.js';

export class FixAttemptRepository {
  async findById(id: string): Promise<FixAttempt | undefined> {
    const { rows } = await getPool().query('SELECT * FROM fix_attempts WHERE id = $1', [id]);
    return rows[0] as FixAttempt | undefined;
  }

  async findByTask(taskId: string): Promise<FixAttempt[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM fix_attempts WHERE task_id = $1 ORDER BY attempt_number DESC', [taskId]
    );
    return rows as FixAttempt[];
  }

  async findByTasks(taskIds: string[]): Promise<FixAttempt[]> {
    if (taskIds.length === 0) return [];
    const { rows } = await getPool().query(
      'SELECT * FROM fix_attempts WHERE task_id = ANY($1) ORDER BY attempt_number DESC',
      [taskIds]
    );
    return rows as FixAttempt[];
  }

  async getLatestAttemptNumber(taskId: string): Promise<number> {
    const { rows: [row] } = await getPool().query(
      'SELECT COALESCE(MAX(attempt_number), 0) as max_attempt FROM fix_attempts WHERE task_id = $1', [taskId]
    );
    return row.max_attempt;
  }

  async create(data: {
    task_id: string;
    attempt_number: number;
    trigger_run_id?: string;
    files_changed?: string;
    fix_description?: string;
    result_status: string;
  }): Promise<FixAttempt> {
    const pool = getPool();
    const id = uuid();
    await pool.query(`
      INSERT INTO fix_attempts (id, task_id, attempt_number, trigger_run_id, files_changed, fix_description, result_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      id, data.task_id, data.attempt_number,
      data.trigger_run_id ?? null, data.files_changed ?? null,
      data.fix_description ?? null, data.result_status,
    ]);
    return (await this.findById(id))!;
  }
}
