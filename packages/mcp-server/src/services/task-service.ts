import { TaskRepository } from '../db/repositories/task-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { UUID_REGEX } from '../utils/code-gen.js';
import type { Task, TaskStatus } from '../types/index.js';

const taskRepo = new TaskRepository();
const epicRepo = new EpicRepository();
const activityRepo = new ActivityRepository();

async function resolveTask(idOrCode: string): Promise<Task> {
  let task: Task | undefined;
  if (UUID_REGEX.test(idOrCode)) {
    task = await taskRepo.findById(idOrCode);
  } else {
    task = await taskRepo.findByTicketCode(idOrCode);
  }
  if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${idOrCode}`);
  return task;
}

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
  async getById(idOrCode: string): Promise<Task | undefined> {
    if (UUID_REGEX.test(idOrCode)) return taskRepo.findById(idOrCode);
    return taskRepo.findByTicketCode(idOrCode);
  }

  async getAll(filters?: { epic_id?: string; status?: string; assignee?: string; project_id?: string }): Promise<Task[]> {
    return taskRepo.findAll(filters);
  }

  async getSubtasks(parentId: string): Promise<Task[]> {
    return taskRepo.findByParent(parentId);
  }

  async create(data: {
    title: string;
    epic_id?: string;
    parent_id?: string;
    project_id?: string;
    description?: string;
    priority?: number;
    assignee?: string;
    created_by?: 'ai' | 'human';
    estimated_hrs?: number;
  }): Promise<{ task: Task; message: string }> {
    // project_id가 있고 epic_id가 없으면 기본 에픽에 자동 연결
    if (data.project_id && !data.epic_id) {
      const epics = await epicRepo.findByProject(data.project_id);
      let defaultEpic = epics.find(e => e.title === 'General');
      if (!defaultEpic) {
        defaultEpic = await epicRepo.create({
          project_id: data.project_id,
          title: 'General',
          description: '기본 에픽 (project_id로 생성된 태스크 자동 연결)',
          priority: 5,
        });
      }
      data.epic_id = defaultEpic.id;
    }
    const { project_id: _pid, ...createData } = data;
    const task = await taskRepo.create(createData);
    await activityRepo.create({
      task_id: task.id,
      actor: data.created_by ?? 'human',
      action: 'create',
      payload: { title: task.title, epicId: task.epic_id },
    });
    return { task, message: `태스크 '${task.title}' 생성됨` };
  }

  async decompose(taskIdOrCode: string, subtasks: { title: string; description?: string; priority?: number; estimated_hrs?: number }[]): Promise<{
    parentTask: Task;
    subtasks: Task[];
    message: string;
  }> {
    const parent = await resolveTask(taskIdOrCode);
    const taskId = parent.id;

    const created: Task[] = [];
    for (const sub of subtasks) {
      const task = await taskRepo.create({
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

    await activityRepo.create({
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

  async updateStatus(taskIdOrCode: string, newStatus: string, notes?: string): Promise<{ task: Task; previousStatus: string; message: string }> {
    const task = await resolveTask(taskIdOrCode);
    const taskId = task.id;

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`잘못된 상태 전환: ${task.status} → ${newStatus}. 가능한 전환: ${allowed?.join(', ') ?? 'none'}`);
    }

    const previousStatus = task.status;
    const updated = await taskRepo.updateStatus(taskId, newStatus, notes);

    await activityRepo.create({
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

  async setPriority(taskIdOrCode: string, priority: number, reason: string): Promise<{ task: Task; previousPriority: number; message: string }> {
    if (priority < 1 || priority > 5) throw new Error('우선순위는 1~5 사이여야 합니다');

    const task = await resolveTask(taskIdOrCode);
    const taskId = task.id;

    const previousPriority = task.priority;
    const updated = await taskRepo.updatePriority(taskId, priority);

    await activityRepo.create({
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

  async addDependency(taskIdOrCode: string, dependsOnIdOrCode: string): Promise<{ message: string }> {
    const task = await resolveTask(taskIdOrCode);
    const taskId = task.id;
    const dep = await resolveTask(dependsOnIdOrCode);
    const dependsOnId = dep.id;

    if (await taskRepo.hasCircularDependency(taskId, dependsOnId)) {
      throw new Error(`순환 의존성이 감지되었습니다: ${taskId} → ${dependsOnId}`);
    }

    await taskRepo.addDependency(taskId, dependsOnId);

    await activityRepo.create({
      task_id: taskId,
      actor: 'ai',
      action: 'update',
      payload: { field: 'dependency', dependsOn: dependsOnId },
    });

    return { message: `의존성 추가: '${task.title}' → '${dep.title}'` };
  }

  async update(idOrCode: string, data: Partial<Task>): Promise<Task> {
    const task = await resolveTask(idOrCode);
    return taskRepo.update(task.id, data);
  }

  async getStatusCounts(projectId: string): Promise<Record<string, number>> {
    return taskRepo.countByStatus(projectId);
  }
}
