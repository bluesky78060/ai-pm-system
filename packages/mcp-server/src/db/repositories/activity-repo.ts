import { getPool } from '../connection.js';
import type { ActivityLog } from '../../types/index.js';

export class ActivityRepository {
  private deserialize(row: ActivityLog): ActivityLog {
    return {
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    };
  }

  async create(data: {
    task_id?: string;
    actor: 'ai' | 'human' | 'github' | 'system';
    action: string;
    payload?: Record<string, unknown>;
  }): Promise<ActivityLog> {
    const pool = getPool();
    const { rows } = await pool.query(
      'INSERT INTO activity_log (task_id, actor, action, payload) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.task_id ?? null, data.actor, data.action, data.payload ? JSON.stringify(data.payload) : null]
    );
    return rows[0] as ActivityLog;
  }

  async findByTask(taskId: string, limit = 50): Promise<ActivityLog[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM activity_log WHERE task_id = $1 ORDER BY created_at DESC LIMIT $2',
      [taskId, limit]
    );
    return rows.map(row => this.deserialize(row as ActivityLog));
  }

  async logAiAnalysis(taskId: string, analysis: string, context?: Record<string, unknown>): Promise<ActivityLog> {
    return this.create({
      task_id: taskId,
      actor: 'ai',
      action: 'ai_analysis',
      payload: { analysis, ...context },
    });
  }

  async logCodeChange(taskId: string, data: {
    files: { path: string; additions: number; deletions: number }[];
    description: string;
    diff_summary?: string;
  }): Promise<ActivityLog> {
    return this.create({
      task_id: taskId,
      actor: 'ai',
      action: 'code_change',
      payload: data as unknown as Record<string, unknown>,
    });
  }

  async logError(taskId: string, data: {
    error_type: string;
    message: string;
    file?: string;
    line?: number;
    stack?: string;
  }): Promise<ActivityLog> {
    return this.create({
      task_id: taskId,
      actor: 'system',
      action: 'error_detected',
      payload: data as unknown as Record<string, unknown>,
    });
  }

  async findRecent(limit = 50, filters?: { actor?: string; task_id?: string }): Promise<ActivityLog[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (filters?.actor) { conditions.push(`actor = $${idx++}`); values.push(filters.actor); }
    if (filters?.task_id) { conditions.push(`task_id = $${idx++}`); values.push(filters.task_id); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit);
    const { rows } = await getPool().query(
      `SELECT * FROM activity_log ${where} ORDER BY created_at DESC LIMIT $${idx}`, values
    );
    return rows.map(row => this.deserialize(row as ActivityLog));
  }
}
