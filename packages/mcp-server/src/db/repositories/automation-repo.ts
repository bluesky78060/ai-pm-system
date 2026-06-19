import type { AutomationRule } from '../../types/entities.js';
import { getPool } from '../connection.js';

export class AutomationRepository {
	async create(data: Omit<AutomationRule, 'created_at'>): Promise<AutomationRule> {
		const pool = getPool();
		await pool.query(
			`
      INSERT INTO automation_rules (id, project_id, name, trigger_event, condition, action_type, action_config, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
			[
				data.id,
				data.project_id,
				data.name,
				data.trigger_event,
				data.condition ?? null,
				data.action_type,
				data.action_config ?? null,
				data.enabled,
			],
		);
		return (await this.findById(data.id))!;
	}

	async findById(id: string): Promise<AutomationRule | undefined> {
		const { rows } = await getPool().query('SELECT * FROM automation_rules WHERE id = $1', [id]);
		return rows[0] as AutomationRule | undefined;
	}

	async findByProject(projectId: string): Promise<AutomationRule[]> {
		const { rows } = await getPool().query(
			'SELECT * FROM automation_rules WHERE project_id = $1 ORDER BY created_at',
			[projectId],
		);
		return rows as AutomationRule[];
	}

	async findByTrigger(projectId: string, trigger: string): Promise<AutomationRule[]> {
		const { rows } = await getPool().query(
			'SELECT * FROM automation_rules WHERE project_id = $1 AND trigger_event = $2 AND enabled = TRUE ORDER BY created_at',
			[projectId, trigger],
		);
		return rows as AutomationRule[];
	}

	async update(
		id: string,
		data: Partial<Pick<AutomationRule, 'name' | 'condition' | 'action_config' | 'enabled'>>,
	): Promise<AutomationRule> {
		const fields: string[] = [];
		const values: unknown[] = [];
		let idx = 1;
		if (data.name !== undefined) {
			fields.push(`name = $${idx++}`);
			values.push(data.name);
		}
		if (data.condition !== undefined) {
			fields.push(`condition = $${idx++}`);
			values.push(data.condition);
		}
		if (data.action_config !== undefined) {
			fields.push(`action_config = $${idx++}`);
			values.push(data.action_config);
		}
		if (data.enabled !== undefined) {
			fields.push(`enabled = $${idx++}`);
			values.push(data.enabled);
		}
		if (fields.length === 0) return (await this.findById(id))!;
		values.push(id);
		await getPool().query(
			`UPDATE automation_rules SET ${fields.join(', ')} WHERE id = $${idx}`,
			values,
		);
		return (await this.findById(id))!;
	}

	async delete(id: string): Promise<void> {
		await getPool().query('DELETE FROM automation_rules WHERE id = $1', [id]);
	}

	async toggle(id: string): Promise<AutomationRule> {
		await getPool().query('UPDATE automation_rules SET enabled = NOT enabled WHERE id = $1', [id]);
		return (await this.findById(id))!;
	}
}
