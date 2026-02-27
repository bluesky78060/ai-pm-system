import { TaskRepository } from '../db/repositories/task-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { TestRunRepository } from '../db/repositories/test-run-repo.js';
import { FixAttemptRepository } from '../db/repositories/fix-attempt-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { TaskService } from './task-service.js';
import { ContextService } from './context-service.js';
import type { Task, FixAttempt } from '../types/index.js';
import { v4 as uuid } from 'uuid';

export interface TestResult {
  test_type: string;
  status: string;
  output?: string;
  failures?: string;
  duration_ms?: number;
}

export class WorkflowService {
  private taskRepo = new TaskRepository();
  private activityRepo = new ActivityRepository();
  private testRunRepo = new TestRunRepository();
  private fixAttemptRepo = new FixAttemptRepository();
  private epicRepo = new EpicRepository();
  private taskService = new TaskService();
  private contextService = new ContextService();

  /**
   * startWork: 태스크를 in_progress로 전환하고 관련 컨텍스트를 반환합니다.
   */
  async startWork(taskId: string): Promise<{
    task: Task;
    subtasks: Task[];
    dependencies: { task_id: string; depends_on: string }[];
    message: string;
  }> {
    const found = await this.taskService.getById(taskId);
    if (!found) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

    let task: Task;
    try {
      const result = await this.taskService.updateStatus(found.id, 'in_progress', '작업 시작 (smart_workflow)');
      task = result.task;
    } catch (e) {
      throw new Error(`작업 시작 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`);
    }

    const subtasks = await this.taskService.getSubtasks(task.id);
    const dependencies = await this.taskRepo.getDependencies(task.id);

    return {
      task,
      subtasks,
      dependencies,
      message: `'${task.title}' 작업을 시작합니다 (in_progress 전환 완료)`,
    };
  }

  /**
   * submitTest: 테스트 결과를 제출하고 결과에 따라 상태를 자동 전환합니다.
   * - 전체 통과 → review
   * - 실패 + 시도 < 3 → fixing
   * - 실패 + 시도 >= 3 → blocked (에스컬레이션)
   */
  async submitTest(
    taskId: string,
    results: TestResult[],
  ): Promise<{
    task: Task;
    overall: 'pass' | 'fail';
    run_number: number;
    next_status: string;
  }> {
    const found = await this.taskService.getById(taskId);
    if (!found) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

    let task = found;

    // in_progress 상태면 자동으로 testing으로 전환
    if (task.status === 'in_progress') {
      try {
        const result = await this.taskService.updateStatus(task.id, 'testing', '테스트 제출 (smart_workflow)');
        task = result.task;
      } catch (e) {
        throw new Error(`testing 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`);
      }
    }

    // 테스트 결과 기록
    const run_number = await this.testRunRepo.getLatestRunNumber(task.id) + 1;
    for (const result of results) {
      await this.testRunRepo.create({
        task_id: task.id,
        run_number,
        test_type: result.test_type,
        status: result.status,
        output: result.output,
        failures: result.failures,
        duration_ms: result.duration_ms,
      });
    }

    // 전체 결과 판정
    const overall: 'pass' | 'fail' = results.some((r) => r.status === 'fail') ? 'fail' : 'pass';

    if (overall === 'pass') {
      try {
        const result = await this.taskService.updateStatus(task.id, 'review', '테스트 통과 → 리뷰 (smart_workflow)');
        task = result.task;
      } catch (e) {
        throw new Error(`review 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`);
      }
    } else {
      // 수정 시도 횟수 확인
      const attempts = await this.fixAttemptRepo.getLatestAttemptNumber(task.id);

      if (attempts < 3) {
        try {
          const result = await this.taskService.updateStatus(task.id, 'fixing', '테스트 실패 → 수정 필요 (smart_workflow)');
          task = result.task;
        } catch (e) {
          throw new Error(`fixing 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`);
        }
      } else {
        try {
          const result = await this.taskService.updateStatus(task.id, 'blocked', '3회 수정 실패 → 에스컬레이션 (smart_workflow)');
          task = result.task;
        } catch (e) {
          throw new Error(`blocked 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`);
        }
      }
    }

    await this.activityRepo.create({
      task_id: task.id,
      actor: 'ai',
      action: 'workflow_test',
      payload: { overall, run_number, results_count: results.length },
    });

    return {
      task,
      overall,
      run_number,
      next_status: task.status,
    };
  }

  /**
   * completeFix: 수정 완료 후 재테스트(testing) 상태로 전환합니다.
   */
  async completeFix(
    taskId: string,
    notes?: string,
  ): Promise<{
    task: Task;
    message: string;
  }> {
    const found = await this.taskService.getById(taskId);
    if (!found) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

    const fixAttempts = await this.fixAttemptRepo.findByTask(found.id);
    const lastAttempt: FixAttempt | undefined = fixAttempts.length > 0 ? fixAttempts[0] : undefined;

    let task: Task;
    try {
      const result = await this.taskService.updateStatus(found.id, 'testing', notes ?? '수정 완료 → 재테스트 (smart_workflow)');
      task = result.task;
    } catch (e) {
      throw new Error(`testing 상태 전환 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`);
    }

    await this.activityRepo.create({
      task_id: task.id,
      actor: 'ai',
      action: 'workflow_fix_complete',
      payload: { attempt_number: lastAttempt?.attempt_number },
    });

    return {
      task,
      message: `'${task.title}' 수정 완료, 재테스트 상태로 전환됨`,
    };
  }

  /**
   * approveReview: 리뷰를 승인하고 done으로 전환합니다.
   * 에픽 완료율과 다음 추천 태스크를 함께 반환합니다.
   */
  async approveReview(
    taskId: string,
    notes?: string,
  ): Promise<{
    task: Task;
    epicProgress: { total: number; completed: number; rate: number } | null;
    nextRecommended: { task: Task; reason: string } | null;
    message: string;
  }> {
    const found = await this.taskService.getById(taskId);
    if (!found) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

    let task: Task;
    try {
      const result = await this.taskService.updateStatus(found.id, 'done', notes ?? '리뷰 승인 → 완료 (smart_workflow)');
      task = result.task;
    } catch (e) {
      throw new Error(`done 상태 전환 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`);
    }

    // 에픽 완료율 계산
    let epicProgress: { total: number; completed: number; rate: number } | null = null;
    let nextRecommended: { task: Task; reason: string } | null = null;

    if (task.epic_id) {
      const epicTasks = await this.taskRepo.findByEpic(task.epic_id);
      const total = epicTasks.length;
      const completed = epicTasks.filter((t) => t.status === 'done').length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      epicProgress = { total, completed, rate };

      // 다음 추천 태스크: 같은 프로젝트의 todo 태스크 중 의존성 모두 완료된 것
      const epic = await this.epicRepo.findById(task.epic_id);
      if (epic) {
        try {
          const sessionContext = await this.contextService.getSessionContext(epic.project_id);
          nextRecommended = sessionContext.nextRecommended;
        } catch {
          // 컨텍스트 조회 실패 시 무시 (nextRecommended는 null 유지)
        }
      }
    }

    return {
      task,
      epicProgress,
      nextRecommended,
      message: `'${task.title}' 리뷰 승인 완료. 상태: done${epicProgress ? ` (에픽 진행률: ${epicProgress.rate}%)` : ''}`,
    };
  }
}
