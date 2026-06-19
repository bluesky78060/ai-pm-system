import { randomUUID } from 'node:crypto';
import { getPool } from '../db/connection.js';
import { TaskService } from './task-service.js';

export interface TaskTemplate {
	id: string;
	project_id: string;
	name: string;
	description: string | null;
	priority: number;
	estimated_hrs: number | null;
	subtasks: SubtaskTemplate[] | null;
	created_at: string;
}

export interface SubtaskTemplate {
	title: string;
	description?: string;
	priority?: number;
	estimated_hrs?: number;
}

export class TemplateService {
	private pool = getPool();
	private taskService = new TaskService();

	async createTemplate(data: {
		project_id: string;
		name: string;
		description?: string;
		priority?: number;
		estimated_hrs?: number;
		subtasks?: SubtaskTemplate[];
	}): Promise<TaskTemplate> {
		const id = randomUUID();
		const subtasksJson = data.subtasks ? JSON.stringify(data.subtasks) : null;

		const result = await this.pool.query<TaskTemplate>(
			`INSERT INTO task_templates (id, project_id, name, description, priority, estimated_hrs, subtasks)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
			[
				id,
				data.project_id,
				data.name,
				data.description ?? null,
				data.priority ?? 3,
				data.estimated_hrs ?? null,
				subtasksJson,
			],
		);

		return this.deserialize(result.rows[0]);
	}

	async getTemplates(projectId: string): Promise<TaskTemplate[]> {
		const result = await this.pool.query<TaskTemplate>(
			'SELECT * FROM task_templates WHERE project_id = $1 ORDER BY created_at DESC',
			[projectId],
		);

		return result.rows.map((row) => this.deserialize(row));
	}

	async getById(templateId: string): Promise<TaskTemplate | undefined> {
		const result = await this.pool.query<TaskTemplate>(
			'SELECT * FROM task_templates WHERE id = $1',
			[templateId],
		);

		return result.rows[0] ? this.deserialize(result.rows[0]) : undefined;
	}

	async applyTemplate(
		templateId: string,
		overrides?: {
			title?: string;
			epic_id?: string;
			description?: string;
			priority?: number;
			estimated_hrs?: number;
			assignee?: string;
		},
	): Promise<{ task: any; subtasks: any[] }> {
		const template = await this.getById(templateId);
		if (!template) {
			console.error(`[TemplateService] Template not found: ${templateId}`);
			throw new Error('템플릿을 찾을 수 없습니다');
		}

		// Create main task from template
		const taskData = {
			title: overrides?.title ?? template.name,
			epic_id: overrides?.epic_id,
			description: overrides?.description ?? template.description ?? undefined,
			priority: overrides?.priority ?? template.priority,
			estimated_hrs: overrides?.estimated_hrs ?? template.estimated_hrs ?? undefined,
			assignee: overrides?.assignee,
			created_by: 'ai' as const,
		};

		const { task } = await this.taskService.create(taskData);

		// Create subtasks if template has them
		let subtasks: any[] = [];
		if (template.subtasks && template.subtasks.length > 0) {
			const decomposed = await this.taskService.decompose(task.id, template.subtasks);
			subtasks = decomposed.subtasks;
		}

		return { task, subtasks };
	}

	async delete(templateId: string): Promise<void> {
		await this.pool.query('DELETE FROM task_templates WHERE id = $1', [templateId]);
	}

	private deserialize(row: any): TaskTemplate {
		return {
			...row,
			subtasks: row.subtasks ? JSON.parse(row.subtasks) : null,
		};
	}
}
