import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { ProjectRepository } from '../db/repositories/project-repo.js';
import type { Epic, Project } from '../types/index.js';
import { UUID_REGEX } from '../utils/code-gen.js';

const projectRepo = new ProjectRepository();
const epicRepo = new EpicRepository();
const activityRepo = new ActivityRepository();

export class ProjectService {
	async getAll(): Promise<Project[]> {
		return projectRepo.findAll();
	}

	async getById(idOrCode: string): Promise<Project | undefined> {
		if (UUID_REGEX.test(idOrCode)) return projectRepo.findById(idOrCode);
		return projectRepo.findByCode(idOrCode);
	}

	async create(data: {
		name: string;
		description?: string;
		github_repo?: string;
	}): Promise<Project> {
		const project = await projectRepo.create(data);
		await activityRepo.create({
			actor: 'human',
			action: 'create',
			payload: { type: 'project', projectId: project.id, name: project.name },
		});
		return project;
	}

	async update(
		id: string,
		data: Partial<Pick<Project, 'name' | 'description' | 'status' | 'github_repo'>>,
	): Promise<Project> {
		return projectRepo.update(id, data);
	}

	async getEpics(projectId: string): Promise<Epic[]> {
		return epicRepo.findByProject(projectId);
	}

	async createEpic(data: {
		project_id: string;
		title: string;
		description?: string;
		priority?: number;
	}): Promise<Epic> {
		const epic = await epicRepo.create(data);
		await activityRepo.create({
			actor: 'human',
			action: 'create',
			payload: { type: 'epic', epicId: epic.id, title: epic.title },
		});
		return epic;
	}

	async updateEpic(
		id: string,
		data: Partial<Pick<Epic, 'title' | 'description' | 'status' | 'priority' | 'order_index'>>,
	): Promise<Epic> {
		return epicRepo.update(id, data);
	}
}
