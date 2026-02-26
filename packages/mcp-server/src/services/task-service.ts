import { TaskRepository } from '../db/repositories/task-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import type { Task, TaskStatus } from '../types/index.js';

const taskRepo = new TaskRepository();
const activityRepo = new ActivityRepository();

const VALID_TRANSITIONS: Record<string, string[]> = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['testing', 'blocked', 'todo'],
  testing: ['fixing', 'review', 'blocked'],
  fixing: ['testing', 'blocked'],
  review: ['done', 'in_progress'],
  done: ['in_progress'],
  blocked: ['todo', 'in_progress'],
};

export class TaskService {
  getById(id: string): Task | undefined {
    return taskRepo.findById(id);
  }

  getAll(filters?: { epic_id?: string; status?: string; assignee?: string; project_id?: string }): Task[] {
    return taskRepo.findAll(filters);
  }

  getSubtasks(parentId: string): Task[] {
    return taskRepo.findByParent(parentId);
  }

  create(data: {
    title: string;
    epic_id?: string;
    parent_id?: string;
    description?: string;
    priority?: number;
    assignee?: string;
    created_by?: 'ai' | 'human';
    estimated_hrs?: number;
  }): { task: Task; message: string } {
    const task = taskRepo.create(data);
    activityRepo.create({
      task_id: task.id,
      actor: data.created_by ?? 'human',
      action: 'create',
      payload: { title: task.title, epicId: task.epic_id },
    });
    return { task, message: `태스크 '${task.title}' 생성됨` };
  }

  decompose(taskId: string, subtasks: { title: string; description?: string; priority?: number; estimated_hrs?: number }[]): {
    parentTask: Task;
    subtasks: Task[];
    message: string;
  } {
    const parent = taskRepo.findById(taskId);
    if (!parent) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

    const created: Task[] = [];
    for (const sub of subtasks) {
      const task = taskRepo.create({
        title: sub.title,
        description: sub.description,
        priority: sub.priority,
        estimated_hrs: sub.estimated_hrs,
        parent_id: taskId,
        epic_id: parent.epic_id ?? undefined,
        created_by: 'ai',
      });
      created.push(task);
    }

    activityRepo.create({
      task_id: taskId,
      actor: 'ai',
      action: 'decompose',
      payload: { subtaskCount: created.length, subtaskIds: created.map((t) => t.id) },
    });

    return {
      parentTask: parent,
      subtasks: created,
      message: `'${parent.title}'을(를) ${created.length}개 서브태스크로 분해함`,
    };
  }

  updateStatus(taskId: string, newStatus: string, notes?: string): { task: Task; previousStatus: string; message: string } {
    const task = taskRepo.findById(taskId);
    if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`잘못된 상태 전환: ${task.status} → ${newStatus}. 가능한 전환: ${allowed?.join(', ') ?? 'none'}`);
    }

    const previousStatus = task.status;
    const updated = taskRepo.updateStatus(taskId, newStatus, notes);

    activityRepo.create({
      task_id: taskId,
      actor: 'ai',
      action: 'status_change',
      payload: { from: previousStatus, to: newStatus, notes },
    });

    return {
      task: updated,
      previousStatus,
      message: `'${task.title}' 상태 변경: ${previousStatus} → ${newStatus}`,
    };
  }

  setPriority(taskId: string, priority: number, reason: string): { task: Task; previousPriority: number; message: string } {
    if (priority < 1 || priority > 5) throw new Error('우선순위는 1~5 사이여야 합니다');

    const task = taskRepo.findById(taskId);
    if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

    const previousPriority = task.priority;
    const updated = taskRepo.updatePriority(taskId, priority);

    activityRepo.create({
      task_id: taskId,
      actor: 'ai',
      action: 'update',
      payload: { field: 'priority', from: previousPriority, to: priority, reason },
    });

    return {
      task: updated,
      previousPriority,
      message: `'${task.title}' 우선순위: ${previousPriority} → ${priority} (${reason})`,
    };
  }

  addDependency(taskId: string, dependsOnId: string): { message: string } {
    const task = taskRepo.findById(taskId);
    if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);
    const dep = taskRepo.findById(dependsOnId);
    if (!dep) throw new Error(`의존 대상 태스크를 찾을 수 없습니다: ${dependsOnId}`);

    if (taskRepo.hasCircularDependency(taskId, dependsOnId)) {
      throw new Error(`순환 의존성이 감지되었습니다: ${taskId} → ${dependsOnId}`);
    }

    taskRepo.addDependency(taskId, dependsOnId);

    activityRepo.create({
      task_id: taskId,
      actor: 'ai',
      action: 'update',
      payload: { field: 'dependency', dependsOn: dependsOnId },
    });

    return { message: `의존성 추가: '${task.title}' → '${dep.title}'` };
  }

  getStatusCounts(projectId: string): Record<string, number> {
    return taskRepo.countByStatus(projectId);
  }
}
