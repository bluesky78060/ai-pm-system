import { getDb } from '../connection.js';
import type { ActivityLog } from '../../types/index.js';

export class ActivityRepository {
  private deserialize(row: ActivityLog): ActivityLog {
    return {
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    };
  }

  create(data: {
    task_id?: string;
    actor: 'ai' | 'human' | 'github' | 'system';
    action: string;
    payload?: Record<string, unknown>;
  }): ActivityLog {
    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO activity_log (task_id, actor, action, payload) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(
      data.task_id ?? null,
      data.actor,
      data.action,
      data.payload ? JSON.stringify(data.payload) : null,
    );
    return db.prepare('SELECT * FROM activity_log WHERE id = ?').get(result.lastInsertRowid) as ActivityLog;
  }

  findByTask(taskId: string, limit = 50): ActivityLog[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC LIMIT ?').all(taskId, limit) as ActivityLog[];
    return rows.map(row => this.deserialize(row));
  }

  findRecent(limit = 50, filters?: { actor?: string; task_id?: string }): ActivityLog[] {
    const db = getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filters?.actor) { conditions.push('actor = ?'); values.push(filters.actor); }
    if (filters?.task_id) { conditions.push('task_id = ?'); values.push(filters.task_id); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit);
    const rows = db.prepare(`SELECT * FROM activity_log ${where} ORDER BY created_at DESC LIMIT ?`).all(...values) as ActivityLog[];
    return rows.map(row => this.deserialize(row));
  }
}
