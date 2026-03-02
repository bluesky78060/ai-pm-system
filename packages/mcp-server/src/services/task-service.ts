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

    // 풍부한 생성 로그: 에픽 이름, 우선순위, 설명 포함
    const epicInfo = task.epic_id ? await epicRepo.findById(task.epic_id) : null;
    await activityRepo.create({
      task_id: task.id,
      actor: data.created_by ?? 'human',
      action: 'create',
      payload: {
        title: task.title,
        description: task.description || null,
        ticket_code: task.ticket_code,
        epic_id: task.epic_id,
        epic_title: epicInfo?.title || null,
        priority: task.priority,
        assignee: task.assignee || null,
        estimated_hrs: task.estimated_hrs || null,
        created_by: data.created_by ?? 'human',
      },
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

    // 증거(notes) 필수 전환: testing→review, review→done
    const EVIDENCE_REQUIRED: Record<string, string[]> = {
      testing: ['review'],
      review: ['done'],
    };
    const needsEvidence = EVIDENCE_REQUIRED[task.status]?.includes(newStatus);
    if (needsEvidence && (!notes || notes.trim().length < 5)) {
      throw new Error(`${task.status} → ${newStatus} 전환 시 검증 결과(notes)를 5자 이상 작성해야 합니다. 형식적 전환은 금지됩니다.`);
    }

    // 최소 체류 시간 검증 (testing, review 상태에서 30초 이상 경과 필요)
    const MIN_DURATION_STATES = ['testing', 'review'];
    if (MIN_DURATION_STATES.includes(task.status)) {
      const activities = await activityRepo.findByTask(taskId, 50);
      const enteredAt = activities.find(a => {
        if (a.action !== 'status_change') return false;
        const p = (typeof a.payload === 'object' && a.payload !== null) ? a.payload as Record<string, unknown> : {};
        return p.to === task.status;
      });
      if (enteredAt) {
        const elapsed = Math.floor((Date.now() - new Date(enteredAt.created_at).getTime()) / 1000);
        if (elapsed < 30) {
          throw new Error(`${task.status} 상태에서 최소 30초 이상 경과해야 전환할 수 있습니다. (현재 ${elapsed}초 경과)`);
        }
      }
    }

    const previousStatus = task.status;
    const updated = await taskRepo.updateStatus(taskId, newStatus, notes);

    // 소요 시간 계산
    const allActivities = await activityRepo.findByTask(taskId, 100);
    const lastTime = allActivities.length > 0 ? new Date(allActivities[0].created_at) : new Date(task.created_at);
    const durationSeconds = Math.floor((Date.now() - lastTime.getTime()) / 1000);
    const createdTime = new Date(task.created_at);
    const totalSeconds = Math.floor((Date.now() - createdTime.getTime()) / 1000);

    // 상태 전환별 추가 컨텍스트 수집
    const extra: Record<string, unknown> = {};

    if (newStatus === 'in_progress') {
      // 서브태스크 정보
      const subtasks = await taskRepo.findByParent(taskId);
      const deps = await taskRepo.getDependencies(taskId);
      if (subtasks.length > 0) {
        extra.subtask_count = subtasks.length;
        extra.subtask_done = subtasks.filter(s => s.status === 'done').length;
      }
      if (deps.length > 0) extra.dependency_count = deps.length;
    }

    if (newStatus === 'done') {
      // 에픽 진행률
      if (task.epic_id) {
        const epicTasks = await taskRepo.findByEpic(task.epic_id);
        const epicTotal = epicTasks.length;
        const epicDone = epicTasks.filter(t => t.status === 'done').length + 1; // +1 for current task
        extra.epic_progress = { total: epicTotal, completed: Math.min(epicDone, epicTotal), rate: epicTotal > 0 ? Math.round((Math.min(epicDone, epicTotal) / epicTotal) * 100) : 0 };
      }
      extra.total_duration_seconds = totalSeconds;
      // 이 태스크의 전체 상태 변경 히스토리
      const statusChanges = allActivities.filter(a => a.action === 'status_change').reverse();
      extra.status_history = statusChanges.map(a => {
        const p = (typeof a.payload === 'object' && a.payload !== null) ? a.payload as Record<string, unknown> : {};
        return { from: p.from, to: p.to, at: a.created_at };
      });
    }

    if (newStatus === 'testing' || newStatus === 'review') {
      // 이전 테스트/수정 시도 횟수
      const testRuns = allActivities.filter(a => a.action === 'test_run' || a.action === 'workflow_test');
      const fixAttempts = allActivities.filter(a => {
        if (a.action !== 'status_change') return false;
        const p = (typeof a.payload === 'object' && a.payload !== null) ? a.payload : {};
        return (p as Record<string, unknown>).to === 'fixing';
      });
      if (testRuns.length > 0) extra.test_run_count = testRuns.length;
      if (fixAttempts.length > 0) extra.fix_attempt_count = fixAttempts.length;
    }

    if (newStatus === 'blocked') {
      extra.blocked_from = previousStatus;
    }

    await activityRepo.create({
      task_id: taskId,
      actor: 'ai',
      action: 'status_change',
      payload: {
        from: previousStatus,
        to: newStatus,
        notes,
        duration_seconds: durationSeconds,
        ticket_code: task.ticket_code,
        ...extra,
      },
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

  async delete(idOrCode: string): Promise<void> {
    const task = await resolveTask(idOrCode);
    await taskRepo.delete(task.id);
  }

  async update(idOrCode: string, data: Partial<Task>): Promise<Task> {
    const task = await resolveTask(idOrCode);
    const updated = await taskRepo.update(task.id, data);

    // Log meaningful field changes
    const trackedFields = ['title', 'description', 'assignee', 'estimated_hrs', 'epic_id'];
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const taskRecord = task as unknown as Record<string, unknown>;
    const dataRecord = data as unknown as Record<string, unknown>;
    for (const field of trackedFields) {
      if (field in data && dataRecord[field] !== taskRecord[field]) {
        changes[field] = {
          from: taskRecord[field],
          to: dataRecord[field],
        };
      }
    }

    if (Object.keys(changes).length > 0) {
      await activityRepo.create({
        task_id: task.id,
        actor: 'human',
        action: 'update',
        payload: { changes },
      });
    }

    return updated;
  }

  async getStatusCounts(projectId: string): Promise<Record<string, number>> {
    return taskRepo.countByStatus(projectId);
  }
}
