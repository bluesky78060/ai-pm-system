import { v4 as uuid } from 'uuid';
import { getPool } from '../connection.js';

export interface SearchFilters {
	status?: string[];
	assignee?: string[];
	epic_id?: string[];
	priority?: number[];
	date_range?: { start: string; end: string };
}

export interface SavedSearch {
	id: string;
	user_id: string;
	name: string;
	query: string;
	filters?: SearchFilters;
	created_at: string;
}

export class SavedSearchRepository {
	async create(data: {
		user_id: string;
		name: string;
		query: string;
		filters?: SearchFilters;
	}): Promise<SavedSearch> {
		const id = uuid();
		const filtersJson = data.filters ? JSON.stringify(data.filters) : null;

		await getPool().query(
			`INSERT INTO saved_searches (id, user_id, name, query, filters)
       VALUES ($1, $2, $3, $4, $5)`,
			[id, data.user_id, data.name, data.query, filtersJson],
		);

		return (await this.findById(id))!;
	}

	async findByUser(userId: string): Promise<SavedSearch[]> {
		const { rows } = await getPool().query(
			'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC',
			[userId],
		);

		return rows.map((row) => ({
			...row,
			filters: row.filters ? JSON.parse(row.filters) : undefined,
		})) as SavedSearch[];
	}

	async findById(id: string): Promise<SavedSearch | undefined> {
		const { rows } = await getPool().query('SELECT * FROM saved_searches WHERE id = $1', [id]);

		if (rows.length === 0) return undefined;

		const row = rows[0];
		return {
			...row,
			filters: row.filters ? JSON.parse(row.filters) : undefined,
		} as SavedSearch;
	}

	async delete(id: string): Promise<void> {
		await getPool().query('DELETE FROM saved_searches WHERE id = $1', [id]);
	}
}
