import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { Epic } from '../../types/index.js';

export class EpicRepository {
  findByProject(projectId: string): Epic[] {
    const db = getDb();
    return db.prepare('SELECT * FROM epics WHERE project_id = ? ORDER BY order_index, priority').all(projectId) as Epic[];
  }

  findById(id: string): Epic | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM epics WHERE id = ?').get(id) as Epic | undefined;
  }

  create(data: { project_id: string; title: string; description?: string; priority?: number }): Epic {
    const db = getDb();
    const id = uuid();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 as next FROM epics WHERE project_id = ?').get(data.project_id) as { next: number };
    db.prepare(
      'INSERT INTO epics (id, project_id, title, description, priority, order_index) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, data.project_id, data.title, data.description ?? null, data.priority ?? 3, maxOrder.next);
    return this.findById(id)!;
  }

  update(id: string, data: Partial<Pick<Epic, 'title' | 'description' | 'status' | 'priority' | 'order_index'>>): Epic {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
    if (data.order_index !== undefined) { fields.push('order_index = ?'); values.push(data.order_index); }
    if (fields.length === 0) return this.findById(id)!;
    values.push(id);
    db.prepare(`UPDATE epics SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id)!;
  }
}
