import { v4 as uuid } from 'uuid';
import { getPool } from '../connection.js';
import type { TestRun } from '../../types/index.js';

export class TestRunRepository {
  async findById(id: string): Promise<TestRun | undefined> {
    const { rows } = await getPool().query('SELECT * FROM test_runs WHERE id = $1', [id]);
    return rows[0] as TestRun | undefined;
  }

  async findByTask(taskId: string): Promise<TestRun[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM test_runs WHERE task_id = $1 ORDER BY run_number DESC, created_at DESC', [taskId]
    );
    return rows as TestRun[];
  }

  async findByTasks(taskIds: string[]): Promise<TestRun[]> {
    if (taskIds.length === 0) return [];
    const { rows } = await getPool().query(
      'SELECT * FROM test_runs WHERE task_id = ANY($1) ORDER BY run_number DESC, created_at DESC',
      [taskIds]
    );
    return rows as TestRun[];
  }

  async getLatestRunNumber(taskId: string): Promise<number> {
    const { rows: [row] } = await getPool().query(
      'SELECT COALESCE(MAX(run_number), 0) as max_run FROM test_runs WHERE task_id = $1', [taskId]
    );
    return row.max_run;
  }

  async create(data: {
    task_id: string;
    run_number: number;
    test_type: string;
    status: string;
    output?: string;
    failures?: string;
    duration_ms?: number;
  }): Promise<TestRun> {
    const pool = getPool();
    const id = uuid();
    await pool.query(`
      INSERT INTO test_runs (id, task_id, run_number, test_type, status, output, failures, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id, data.task_id, data.run_number, data.test_type,
      data.status, data.output ?? null, data.failures ?? null, data.duration_ms ?? null,
    ]);
    return (await this.findById(id))!;
  }

  async countByTaskAndStatus(taskId: string): Promise<Record<string, number>> {
    const { rows } = await getPool().query(`
      SELECT status, COUNT(*)::int as count FROM test_runs WHERE task_id = $1 GROUP BY status
    `, [taskId]);
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  }
}
