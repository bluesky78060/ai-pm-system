import { v4 as uuid } from 'uuid';
import type { Epic } from '../../types/index.js';
import { getPool } from '../connection.js';

export class EpicRepository {
	async findByProject(projectId: string): Promise<Epic[]> {
		const { rows } = await getPool().query(
			'SELECT * FROM epics WHERE project_id = $1 ORDER BY order_index, priority',
			[projectId],
		);
		return rows as Epic[];
	}

	async findById(id: string): Promise<Epic | undefined> {
		const { rows } = await getPool().query('SELECT * FROM epics WHERE id = $1', [id]);
		return rows[0] as Epic | undefined;
	}

	async findBySeq(projectId: string, seq: number): Promise<Epic | undefined> {
		const { rows } = await getPool().query(
			'SELECT * FROM epics WHERE project_id = $1 AND seq = $2',
			[projectId, seq],
		);
		return rows[0] as Epic | undefined;
	}

	async create(data: {
		project_id: string;
		title: string;
		description?: string;
		priority?: number;
	}): Promise<Epic> {
		const pool = getPool();
		const id = uuid();
		const {
			rows: [orderRow],
		} = await pool.query(
			'SELECT COALESCE(MAX(order_index), -1) + 1 as next FROM epics WHERE project_id = $1',
			[data.project_id],
		);
		const {
			rows: [seqRow],
		} = await pool.query(
			'SELECT COALESCE(MAX(seq), 0) + 1 as next FROM epics WHERE project_id = $1',
			[data.project_id],
		);
		await pool.query(
			'INSERT INTO epics (id, project_id, title, description, priority, order_index, seq) VALUES ($1, $2, $3, $4, $5, $6, $7)',
			[
				id,
				data.project_id,
				data.title,
				data.description ?? null,
				data.priority ?? 3,
				orderRow.next,
				seqRow.next,
			],
		);
		return (await this.findById(id))!;
	}

	async update(
		id: string,
		data: Partial<Pick<Epic, 'title' | 'description' | 'status' | 'priority' | 'order_index'>>,
	): Promise<Epic> {
		const pool = getPool();
		const fields: string[] = [];
		const values: unknown[] = [];
		let idx = 1;
		if (data.title !== undefined) {
			fields.push(`title = $${idx++}`);
			values.push(data.title);
		}
		if (data.description !== undefined) {
			fields.push(`description = $${idx++}`);
			values.push(data.description);
		}
		if (data.status !== undefined) {
			fields.push(`status = $${idx++}`);
			values.push(data.status);
		}
		if (data.priority !== undefined) {
			fields.push(`priority = $${idx++}`);
			values.push(data.priority);
		}
		if (data.order_index !== undefined) {
			fields.push(`order_index = $${idx++}`);
			values.push(data.order_index);
		}
		if (fields.length === 0) return (await this.findById(id))!;
		values.push(id);
		await pool.query(`UPDATE epics SET ${fields.join(', ')} WHERE id = $${idx}`, values);
		return (await this.findById(id))!;
	}
}
