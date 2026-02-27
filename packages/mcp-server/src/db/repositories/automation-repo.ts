import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { AutomationRule } from '../../types/entities.js';

type AutomationRuleRow = Omit<AutomationRule, 'enabled'> & { enabled: number };

export class AutomationRepository {
  private deserialize(row: AutomationRuleRow): AutomationRule {
    return {
      ...row,
      enabled: row.enabled === 1,
    };
  }

  create(data: Omit<AutomationRule, 'created_at'>): AutomationRule {
    const db = getDb();
    db.prepare(`
      INSERT INTO automation_rules (id, project_id, name, trigger_event, condition, action_type, action_config, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.project_id,
      data.name,
      data.trigger_event,
      data.condition ?? null,
      data.action_type,
      data.action_config ?? null,
      data.enabled ? 1 : 0,
    );
    return this.findById(data.id)!;
  }

  findById(id: string): AutomationRule | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id) as AutomationRuleRow | undefined;
    if (!row) return undefined;
    return this.deserialize(row);
  }

  findByProject(projectId: string): AutomationRule[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM automation_rules WHERE project_id = ? ORDER BY created_at').all(projectId) as AutomationRuleRow[];
    return rows.map(row => this.deserialize(row));
  }

  findByTrigger(projectId: string, trigger: string): AutomationRule[] {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM automation_rules WHERE project_id = ? AND trigger_event = ? AND enabled = 1 ORDER BY created_at'
    ).all(projectId, trigger) as AutomationRuleRow[];
    return rows.map(row => this.deserialize(row));
  }

  update(id: string, data: Partial<Pick<AutomationRule, 'name' | 'condition' | 'action_config' | 'enabled'>>): AutomationRule {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.condition !== undefined) { fields.push('condition = ?'); values.push(data.condition); }
    if (data.action_config !== undefined) { fields.push('action_config = ?'); values.push(data.action_config); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }
    if (fields.length === 0) return this.findById(id)!;
    values.push(id);
    db.prepare(`UPDATE automation_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id)!;
  }

  delete(id: string): void {
    const db = getDb();
    db.prepare('DELETE FROM automation_rules WHERE id = ?').run(id);
  }

  toggle(id: string): AutomationRule {
    const db = getDb();
    db.prepare('UPDATE automation_rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
    return this.findById(id)!;
  }
}
