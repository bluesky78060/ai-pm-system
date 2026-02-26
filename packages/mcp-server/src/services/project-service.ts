import { ProjectRepository } from '../db/repositories/project-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import type { Project, Epic } from '../types/index.js';

const projectRepo = new ProjectRepository();
const epicRepo = new EpicRepository();
const activityRepo = new ActivityRepository();

export class ProjectService {
  getAll(): Project[] {
    return projectRepo.findAll();
  }

  getById(id: string): Project | undefined {
    return projectRepo.findById(id);
  }

  create(data: { name: string; description?: string; github_repo?: string }): Project {
    const project = projectRepo.create(data);
    activityRepo.create({
      actor: 'human',
      action: 'create',
      payload: { type: 'project', projectId: project.id, name: project.name },
    });
    return project;
  }

  update(id: string, data: Partial<Pick<Project, 'name' | 'description' | 'status' | 'github_repo'>>): Project {
    return projectRepo.update(id, data);
  }

  getEpics(projectId: string): Epic[] {
    return epicRepo.findByProject(projectId);
  }

  createEpic(data: { project_id: string; title: string; description?: string; priority?: number }): Epic {
    const epic = epicRepo.create(data);
    activityRepo.create({
      actor: 'human',
      action: 'create',
      payload: { type: 'epic', epicId: epic.id, title: epic.title },
    });
    return epic;
  }

  updateEpic(id: string, data: Partial<Pick<Epic, 'title' | 'description' | 'status' | 'priority' | 'order_index'>>): Epic {
    return epicRepo.update(id, data);
  }
}
