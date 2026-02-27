import { v4 as uuid } from 'uuid';
import { getPool } from '../connection.js';
import type { Task, TaskDependency } from '../../types/index.js';

export class TaskRepository {
  async findById(id: string): Promise<Task | undefined> {
    const { rows } = await getPool().query('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows[0] as Task | undefined;
  }

  async findByEpic(epicId: string): Promise<Task[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM tasks WHERE epic_id = $1 ORDER BY priority, created_at', [epicId]
    );
    return rows as Task[];
  }

  async findByStatus(status: string, epicId?: string): Promise<Task[]> {
    if (epicId) {
      const { rows } = await getPool().query(
        'SELECT * FROM tasks WHERE status = $1 AND epic_id = $2 ORDER BY priority', [status, epicId]
      );
      return rows as Task[];
    }
    const { rows } = await getPool().query('SELECT * FROM tasks WHERE status = $1 ORDER BY priority', [status]);
    return rows as Task[];
  }

  async findByParent(parentId: string): Promise<Task[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM tasks WHERE parent_id = $1 ORDER BY priority, created_at', [parentId]
    );
    return rows as Task[];
  }

  async findAll(filters?: { epic_id?: string; status?: string; assignee?: string; project_id?: string }): Promise<Task[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.epic_id) { conditions.push(`t.epic_id = $${idx++}`); values.push(filters.epic_id); }
    if (filters?.status) { conditions.push(`t.status = $${idx++}`); values.push(filters.status); }
    if (filters?.assignee) { conditions.push(`t.assignee = $${idx++}`); values.push(filters.assignee); }
    if (filters?.project_id) {
      conditions.push(`t.epic_id IN (SELECT id FROM epics WHERE project_id = $${idx++})`);
      values.push(filters.project_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await getPool().query(
      `SELECT t.* FROM tasks t ${where} ORDER BY t.priority, t.created_at`, values
    );
    return rows as Task[];
  }

  async countByStatus(projectId: string): Promise<Record<string, number>> {
    const { rows } = await getPool().query(`
      SELECT t.status, COUNT(*)::int as count
      FROM tasks t
      JOIN epics e ON t.epic_id = e.id
      WHERE e.project_id = $1
      GROUP BY t.status
    `, [projectId]);
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  }

  async findByTicketCode(ticketCode: string): Promise<Task | undefined> {
    const { rows } = await getPool().query('SELECT * FROM tasks WHERE ticket_code = $1', [ticketCode]);
    return rows[0] as Task | undefined;
  }

  async create(data: {
    title: string;
    epic_id?: string;
    parent_id?: string;
    description?: string;
    priority?: number;
    assignee?: string;
    created_by?: 'ai' | 'human';
    estimated_hrs?: number;
  }): Promise<Task> {
    const pool = getPool();
    const id = uuid();

    let seq: number | null = null;
    let ticketCode: string | null = null;
    if (data.epic_id) {
      const { rows: [seqRow] } = await pool.query(
        'SELECT COALESCE(MAX(seq), 0) + 1 as next FROM tasks WHERE epic_id = $1', [data.epic_id]
      );
      seq = seqRow.next;
      const { rows: epicRows } = await pool.query(`
        SELECT e.seq as epic_seq, p.code as project_code
        FROM epics e JOIN projects p ON e.project_id = p.id
        WHERE e.id = $1
      `, [data.epic_id]);
      const epicInfo = epicRows[0];
      if (epicInfo?.project_code && epicInfo?.epic_seq) {
        ticketCode = `${epicInfo.project_code}-${epicInfo.epic_seq}-${seq}`;
      }
    }

    await pool.query(`
      INSERT INTO tasks (id, epic_id, parent_id, title, description, priority, assignee, created_by, estimated_hrs, seq, ticket_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      id,
      data.epic_id ?? null,
      data.parent_id ?? null,
      data.title,
      data.description ?? null,
      data.priority ?? 3,
      data.assignee ?? 'ai',
      data.created_by ?? 'human',
      data.estimated_hrs ?? null,
      seq,
      ticketCode,
    ]);
    return (await this.findById(id))!;
  }

  async updateStatus(id: string, status: string, _notes?: string): Promise<Task> {
    const completedAt = status === 'done' ? new Date().toISOString() : null;
    await getPool().query('UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3', [status, completedAt, id]);
    return (await this.findById(id))!;
  }

  async updatePriority(id: string, priority: number): Promise<Task> {
    await getPool().query('UPDATE tasks SET priority = $1 WHERE id = $2', [priority, id]);
    return (await this.findById(id))!;
  }

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const allowed = ['title', 'description', 'assignee', 'epic_id', 'github_issue', 'github_pr', 'estimated_hrs', 'actual_hrs', 'blocked_by'] as const;
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return (await this.findById(id))!;
    values.push(id);
    await getPool().query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return (await this.findById(id))!;
  }

  async addDependency(taskId: string, dependsOn: string): Promise<void> {
    await getPool().query(
      'INSERT INTO task_dependencies (task_id, depends_on) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [taskId, dependsOn]
    );
  }

  async getDependencies(taskId: string): Promise<TaskDependency[]> {
    const { rows } = await getPool().query('SELECT * FROM task_dependencies WHERE task_id = $1', [taskId]);
    return rows as TaskDependency[];
  }

  async getDependents(taskId: string): Promise<TaskDependency[]> {
    const { rows } = await getPool().query('SELECT * FROM task_dependencies WHERE depends_on = $1', [taskId]);
    return rows as TaskDependency[];
  }

  async hasCircularDependency(taskId: string, dependsOn: string): Promise<boolean> {
    const pool = getPool();
    const visited = new Set<string>();
    const queue = [dependsOn];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const { rows } = await pool.query('SELECT depends_on FROM task_dependencies WHERE task_id = $1', [current]);
      for (const row of rows) {
        queue.push(row.depends_on);
      }
    }
    return false;
  }
}
