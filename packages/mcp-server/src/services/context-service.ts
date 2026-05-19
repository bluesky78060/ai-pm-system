import { ProjectRepository } from '../db/repositories/project-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { TaskRepository } from '../db/repositories/task-repo.js';
import type { Task, SessionContext, ProjectStatusOutput } from '../types/index.js';

const projectRepo = new ProjectRepository();
const epicRepo = new EpicRepository();
const taskRepo = new TaskRepository();

export interface BlockingIssue {
  task: Task;
  blockedSince: string;
  reason: string | null;
  blockedDependents: Task[];
  suggestedAction: string;
}

export interface BlockingAnalysis {
  projectId: string;
  totalBlocked: number;
  criticalPath: BlockingIssue[];
  delayedTasks: Task[];
  summary: string;
}

export class ContextService {
  async getSessionContext(projectId: string): Promise<SessionContext> {
    const project = await projectRepo.findById(projectId);
    if (!project) { console.error(`[ContextService] Project not found: ${projectId}`); throw new Error('프로젝트를 찾을 수 없습니다'); }

    const allTasks = await taskRepo.findAll({ project_id: projectId });

    // Group current tasks by status
    const inProgress = allTasks.filter((t) => t.status === 'in_progress');
    const testing = allTasks.filter((t) => t.status === 'testing' || t.status === 'fixing' || t.status === 'review');
    const blocked = allTasks.filter((t) => t.status === 'blocked');

    // Recently completed (status='done', limit 5, most recent first)
    // pg driver returns timestamp columns as Date objects despite the `string` type
    // declaration on entities — compare via Date.getTime() to handle both shapes safely.
    const doneTasks = allTasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => {
        const aTime = new Date(a.completed_at ?? a.created_at).getTime();
        const bTime = new Date(b.completed_at ?? b.created_at).getTime();
        return bTime - aTime;
      })
      .slice(0, 5);

    const lastCompletedAt = doneTasks.length > 0 ? (doneTasks[0].completed_at ?? null) : null;

    // Progress counts
    const totalTasks = allTasks.length;
    const completedCount = allTasks.filter((t) => t.status === 'done').length;
    const inProgressCount = inProgress.length;
    const blockedCount = blocked.length;
    const completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    // byEpic progress
    const epics = await epicRepo.findByProject(projectId);
    const byEpic = epics.map((epic) => {
      const epicTasks = allTasks.filter((t) => t.epic_id === epic.id);
      const epicCompleted = epicTasks.filter((t) => t.status === 'done').length;
      const epicTotal = epicTasks.length;
      const rate = epicTotal > 0 ? Math.round((epicCompleted / epicTotal) * 100) : 0;
      return {
        epicId: epic.id,
        epicTitle: epic.title,
        total: epicTotal,
        completed: epicCompleted,
        rate,
      };
    });

    // nextRecommended: highest priority 'todo' task whose all dependencies are 'done'
    const todoTasks = allTasks
      .filter((t) => t.status === 'todo')
      .sort((a, b) => a.priority - b.priority);

    let nextRecommended: SessionContext['nextRecommended'] = null;

    for (const task of todoTasks) {
      const deps = await taskRepo.getDependencies(task.id);
      const allDepsDone = (await Promise.all(
        deps.map(async (dep) => {
          const depTask = await taskRepo.findById(dep.depends_on);
          return depTask?.status === 'done';
        })
      )).every(Boolean);

      if (allDepsDone) {
        let reason: string;
        if (deps.length === 0) {
          reason = `우선순위 ${task.priority}, 블로킹 없는 최고 우선순위 태스크`;
        } else {
          reason = `우선순위 ${task.priority}, 의존성 모두 완료`;
        }
        nextRecommended = { task, reason };
        break;
      }
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        githubRepo: project.github_repo,
      },
      currentTasks: {
        inProgress,
        testing,
        blocked,
      },
      recentlyCompleted: {
        tasks: doneTasks,
        lastCompletedAt,
      },
      progress: {
        totalTasks,
        completed: completedCount,
        inProgress: inProgressCount,
        blocked: blockedCount,
        completionRate,
        byEpic,
      },
      nextRecommended,
    };
  }

  async getProjectStatus(projectId: string): Promise<ProjectStatusOutput> {
    const project = await projectRepo.findById(projectId);
    if (!project) { console.error(`[ContextService] Project not found: ${projectId}`); throw new Error('프로젝트를 찾을 수 없습니다'); }

    const epics = await epicRepo.findByProject(projectId);
    const allTasks = await taskRepo.findAll({ project_id: projectId });

    const statusBreakdown = await taskRepo.countByStatus(projectId);

    const epicsWithCounts = epics.map((epic) => {
      const epicTasks = allTasks.filter((t) => t.epic_id === epic.id);
      const completedCount = epicTasks.filter((t) => t.status === 'done').length;
      const taskCount = epicTasks.length;
      const rate = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
      return {
        ...epic,
        taskCount,
        completedCount,
        rate,
      };
    });

    const totalTasks = allTasks.length;
    const totalCompleted = allTasks.filter((t) => t.status === 'done').length;
    const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

    return {
      project,
      epics: epicsWithCounts,
      summary: {
        totalEpics: epics.length,
        totalTasks,
        completionRate,
        statusBreakdown,
      },
    };
  }

  async getBlockingAnalysis(projectId: string): Promise<BlockingAnalysis> {
    const blockedTasks = await taskRepo.findAll({ project_id: projectId, status: 'blocked' });

    const criticalPath: BlockingIssue[] = [];
    for (const task of blockedTasks) {
      const dependentLinks = await taskRepo.getDependents(task.id);
      const blockedDependents: Task[] = [];
      for (const dep of dependentLinks) {
        const t = await taskRepo.findById(dep.task_id);
        if (t) blockedDependents.push(t);
      }

      let suggestedAction: string;
      if (task.blocked_by) {
        suggestedAction = `블로킹 원인 해결: ${task.blocked_by}`;
      } else if (blockedDependents.length > 0) {
        suggestedAction = `${blockedDependents.length}개 태스크가 대기 중 - 우선 해결 필요`;
      } else {
        suggestedAction = '블로킹 원인을 파악하고 상태를 업데이트하세요';
      }

      criticalPath.push({
        task,
        blockedSince: task.created_at,
        reason: task.blocked_by,
        blockedDependents,
        suggestedAction,
      });
    }

    // Sort by number of dependents (most impact first)
    criticalPath.sort((a, b) => b.blockedDependents.length - a.blockedDependents.length);

    // Delayed tasks: in_progress for more than 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const inProgressTasks = await taskRepo.findAll({ project_id: projectId, status: 'in_progress' });
    const delayedTasks = inProgressTasks.filter((task) => {
      const createdAt = new Date(task.created_at);
      return createdAt < sevenDaysAgo;
    });

    // Generate Korean summary
    let summary: string;
    if (blockedTasks.length === 0 && delayedTasks.length === 0) {
      summary = '현재 블로킹된 태스크가 없으며 진행이 원활합니다.';
    } else {
      const parts: string[] = [];
      if (blockedTasks.length > 0) {
        const maxImpact = criticalPath[0];
        parts.push(`${blockedTasks.length}개 태스크가 블로킹 상태입니다`);
        if (maxImpact && maxImpact.blockedDependents.length > 0) {
          parts.push(`가장 영향이 큰 블로킹: '${maxImpact.task.title}' (${maxImpact.blockedDependents.length}개 태스크 대기)`);
        }
      }
      if (delayedTasks.length > 0) {
        parts.push(`${delayedTasks.length}개 태스크가 7일 이상 진행 중입니다`);
      }
      summary = parts.join('. ') + '.';
    }

    return {
      projectId,
      totalBlocked: blockedTasks.length,
      criticalPath,
      delayedTasks,
      summary,
    };
  }
}
