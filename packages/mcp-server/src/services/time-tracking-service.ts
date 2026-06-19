import { v4 as uuid } from 'uuid';
import { getPool } from '../db/connection.js';

export interface TimeEntry {
	id: string;
	task_id: string;
	status: string;
	started_at: string; // APS-5-10: pg type parser returns ISO string, not Date object
	ended_at: string | null; // APS-5-10: same
	duration_seconds: number | null;
	notes: string | null;
}

export interface TimeStatusSummary {
	status: string;
	total_seconds: number;
	entry_count: number;
}

export interface TimeTrackingSummary {
	task_id: string;
	total_seconds: number;
	by_status: TimeStatusSummary[];
	active_entry: TimeEntry | null;
}

export class TimeTrackingService {
	/**
	 * Start tracking time for a task in a specific status
	 */
	async startTracking(taskId: string, status: string, notes?: string): Promise<TimeEntry> {
		const pool = getPool();

		// Check for existing active entry for this task
		const existingResult = await pool.query<TimeEntry>(
			'SELECT * FROM time_entries WHERE task_id = $1 AND ended_at IS NULL LIMIT 1',
			[taskId],
		);

		// If there's an active entry, stop it first
		if (existingResult.rows.length > 0) {
			await this.stopTracking(taskId);
		}

		const id = uuid();
		const result = await pool.query<TimeEntry>(
			`INSERT INTO time_entries (id, task_id, status, started_at, notes)
       VALUES ($1, $2, $3, NOW(), $4)
       RETURNING *`,
			[id, taskId, status, notes || null],
		);

		return result.rows[0];
	}

	/**
	 * Stop the currently active time entry for a task
	 */
	async stopTracking(taskId: string): Promise<TimeEntry | null> {
		const pool = getPool();

		const result = await pool.query<TimeEntry>(
			`UPDATE time_entries
       SET ended_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
       WHERE task_id = $1 AND ended_at IS NULL
       RETURNING *`,
			[taskId],
		);

		return result.rows.length > 0 ? result.rows[0] : null;
	}

	/**
	 * Get the currently active time entry for a task
	 */
	async getActiveEntry(taskId: string): Promise<TimeEntry | null> {
		const pool = getPool();

		const result = await pool.query<TimeEntry>(
			'SELECT * FROM time_entries WHERE task_id = $1 AND ended_at IS NULL LIMIT 1',
			[taskId],
		);

		return result.rows.length > 0 ? result.rows[0] : null;
	}

	/**
	 * Get total time spent on a task (in seconds)
	 */
	async getTotalTime(taskId: string): Promise<number> {
		const pool = getPool();

		const result = await pool.query<{ total: string | null }>(
			`SELECT COALESCE(SUM(duration_seconds), 0) as total
       FROM time_entries
       WHERE task_id = $1 AND ended_at IS NOT NULL`,
			[taskId],
		);

		return Number.parseInt(result.rows[0].total || '0', 10);
	}

	/**
	 * Get time breakdown by status
	 */
	async getTimeByStatus(taskId: string): Promise<TimeStatusSummary[]> {
		const pool = getPool();

		const result = await pool.query<TimeStatusSummary>(
			`SELECT
         status,
         COALESCE(SUM(duration_seconds), 0)::INTEGER as total_seconds,
         COUNT(*)::INTEGER as entry_count
       FROM time_entries
       WHERE task_id = $1 AND ended_at IS NOT NULL
       GROUP BY status
       ORDER BY total_seconds DESC`,
			[taskId],
		);

		return result.rows;
	}

	/**
	 * Get comprehensive time summary for a task
	 */
	async getTimeSummary(taskId: string): Promise<TimeTrackingSummary> {
		const [totalSeconds, byStatus, activeEntry] = await Promise.all([
			this.getTotalTime(taskId),
			this.getTimeByStatus(taskId),
			this.getActiveEntry(taskId),
		]);

		return {
			task_id: taskId,
			total_seconds: totalSeconds,
			by_status: byStatus,
			active_entry: activeEntry,
		};
	}

	/**
	 * Get all time entries for a task
	 */
	async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
		const pool = getPool();

		const result = await pool.query<TimeEntry>(
			`SELECT * FROM time_entries
       WHERE task_id = $1
       ORDER BY started_at DESC`,
			[taskId],
		);

		return result.rows;
	}

	/**
	 * Add a manual time entry (for retroactive tracking)
	 */
	async addManualEntry(
		taskId: string,
		status: string,
		startedAt: Date,
		endedAt: Date,
		notes?: string,
	): Promise<TimeEntry> {
		const pool = getPool();
		const id = uuid();
		const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

		const result = await pool.query<TimeEntry>(
			`INSERT INTO time_entries (id, task_id, status, started_at, ended_at, duration_seconds, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
			[id, taskId, status, startedAt, endedAt, durationSeconds, notes || null],
		);

		return result.rows[0];
	}
}
