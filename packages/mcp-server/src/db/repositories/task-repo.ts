import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { Task, TaskDependency } from '../../types/index.js';

export class TaskRepository {
  findById(id: string): Task | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  }

  findByEpic(epicId: string): Task[] {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks WHERE epic_id = ? ORDER BY priority, created_at').all(epicId) as Task[];
  }

  findByStatus(status: string, epicId?: string): Task[] {
    const db = getDb();
    if (epicId) {
      return db.prepare('SELECT * FROM tasks WHERE status = ? AND epic_id = ? ORDER BY priority').all(status, epicId) as Task[];
    }
    return db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority').all(status) as Task[];
  }

  findByParent(parentId: string): Task[] {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY priority, created_at').all(parentId) as Task[];
  }

  findAll(filters?: { epic_id?: string; status?: string; assignee?: string; project_id?: string }): Task[] {
    const db = getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.epic_id) { conditions.push('t.epic_id = ?'); values.push(filters.epic_id); }
    if (filters?.status) { conditions.push('t.status = ?'); values.push(filters.status); }
    if (filters?.assignee) { conditions.push('t.assignee = ?'); values.push(filters.assignee); }
    if (filters?.project_id) {
      conditions.push('t.epic_id IN (SELECT id FROM epics WHERE project_id = ?)');
      values.push(filters.project_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return db.prepare(`SELECT t.* FROM tasks t ${where} ORDER BY t.priority, t.created_at`).all(...values) as Task[];
  }

  countByStatus(projectId: string): Record<string, number> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT t.status, COUNT(*) as count
      FROM tasks t
      JOIN epics e ON t.epic_id = e.id
      WHERE e.project_id = ?
      GROUP BY t.status
    `).all(projectId) as { status: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  }

  create(data: {
    title: string;
    epic_id?: string;
    parent_id?: string;
    description?: string;
    priority?: number;
    assignee?: string;
    created_by?: 'ai' | 'human';
    estimated_hrs?: number;
  }): Task {
    const db = getDb();
    const id = uuid();
    db.prepare(`
      INSERT INTO tasks (id, epic_id, parent_id, title, description, priority, assignee, created_by, estimated_hrs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.epic_id ?? null,
      data.parent_id ?? null,
      data.title,
      data.description ?? null,
      data.priority ?? 3,
      data.assignee ?? 'ai',
      data.created_by ?? 'human',
      data.estimated_hrs ?? null,
    );
    return this.findById(id)!;
  }

  updateStatus(id: string, status: string, notes?: string): Task {
    const db = getDb();
    const completedAt = status === 'done' ? "datetime('now')" : 'NULL';
    db.prepare(`UPDATE tasks SET status = ?, completed_at = ${completedAt} WHERE id = ?`).run(status, id);
    return this.findById(id)!;
  }

  updatePriority(id: string, priority: number): Task {
    const db = getDb();
    db.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(priority, id);
    return this.findById(id)!;
  }

  update(id: string, data: Partial<Task>): Task {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    const allowed = ['title', 'description', 'assignee', 'github_issue', 'github_pr', 'estimated_hrs', 'actual_hrs', 'blocked_by'] as const;
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return this.findById(id)!;
    values.push(id);
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id)!;
  }

  // Dependencies
  addDependency(taskId: string, dependsOn: string): void {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on) VALUES (?, ?)').run(taskId, dependsOn);
  }

  getDependencies(taskId: string): TaskDependency[] {
    const db = getDb();
    return db.prepare('SELECT * FROM task_dependencies WHERE task_id = ?').all(taskId) as TaskDependency[];
  }

  getDependents(taskId: string): TaskDependency[] {
    const db = getDb();
    return db.prepare('SELECT * FROM task_dependencies WHERE depends_on = ?').all(taskId) as TaskDependency[];
  }

  hasCircularDependency(taskId: string, dependsOn: string): boolean {
    const db = getDb();
    // BFS to detect cycles
    const visited = new Set<string>();
    const queue = [dependsOn];

    // Check: would adding taskId -> dependsOn create a cycle?
    // This means: can we reach taskId starting from dependsOn?
    // If dependsOn (directly or transitively) depends on taskId, it's circular
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = db.prepare('SELECT depends_on FROM task_dependencies WHERE task_id = ?').all(current) as { depends_on: string }[];
      for (const dep of deps) {
        queue.push(dep.depends_on);
      }
    }
    // Also check: does taskId already depend on dependsOn?
    // Actually the above BFS already handles this: we start from dependsOn's dependencies
    // Wait - we need to check if dependsOn transitively depends on taskId
    // The BFS above does: starting from dependsOn, follow depends_on links, see if we reach taskId
    // But that checks if dependsOn depends on taskId (meaning taskId is a prerequisite of dependsOn)
    // If so, adding taskId -> dependsOn would mean taskId depends on something that depends on taskId = cycle
    return false;
  }
}
