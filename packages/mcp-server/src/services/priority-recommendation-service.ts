import { TaskRepository } from '../db/repositories/task-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { TimeTrackingService } from './time-tracking-service.js';
import type { Task, TaskStatus } from '../types/index.js';
import { UUID_REGEX } from '../utils/code-gen.js';

const taskRepo = new TaskRepository();
const epicRepo = new EpicRepository();
const activityRepo = new ActivityRepository();
const timeTrackingService = new TimeTrackingService();

interface PriorityAnalysis {
  task_id: string;
  ticket_code: string | null;
  title: string;
  current_priority: number;
  suggested_priority: number;
  score: number;
  reasons: string[];
  confidence: 'high' | 'medium' | 'low';
  details: {
    blocking_tasks?: number;
    dependent_tasks?: number;
    epic_completion_rate?: number;
    days_in_progress?: number;
    estimated_vs_actual?: {
      estimated_hrs: number;
      actual_hrs: number;
      overrun_hrs: number;
    };
  };
}

interface ProjectPrioritySuggestion {
  project_id: string;
  analyzed_tasks: number;
  suggestions: PriorityAnalysis[];
  summary: {
    high_priority_needed: number;
    low_priority_needed: number;
    no_change_needed: number;
  };
}

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

export class PriorityRecommendationService {
  /**
   * 단일 태스크의 우선순위를 분석하고 제안을 반환합니다.
   */
  async analyzePriority(taskIdOrCode: string): Promise<PriorityAnalysis> {
    const task = await resolveTask(taskIdOrCode);

    // 분석 컨텍스트 수집
    const context = await this.gatherTaskContext(task);

    // 우선순위 점수 계산
    const { score, reasons, details } = await this.calculatePriorityScore(task, context);

    // 제안 우선순위 결정 (1-5 스케일)
    const suggestedPriority = this.scoreToPriority(score);

    // 신뢰도 계산
    const confidence = this.calculateConfidence(context, reasons.length);

    return {
      task_id: task.id,
      ticket_code: task.ticket_code,
      title: task.title,
      current_priority: task.priority,
      suggested_priority: suggestedPriority,
      score,
      reasons,
      confidence,
      details,
    };
  }

  /**
   * 프로젝트 전체의 태스크 우선순위를 분석하고 조정 제안을 반환합니다.
   */
  async suggestPriorityAdjustments(projectId: string): Promise<ProjectPrioritySuggestion> {
    // 완료되지 않은 모든 태스크 조회
    const tasks = await taskRepo.findAll({ project_id: projectId });
    const activeTasks = tasks.filter(t => t.status !== 'done');

    const suggestions: PriorityAnalysis[] = [];

    for (const task of activeTasks) {
      const analysis = await this.analyzePriority(task.id);

      // 우선순위 변경이 필요한 경우만 포함
      if (analysis.suggested_priority !== analysis.current_priority) {
        suggestions.push(analysis);
      }
    }

    // 우선순위 조정 필요성에 따라 정렬 (점수 차이가 큰 순)
    suggestions.sort((a, b) => {
      const aDiff = Math.abs(a.suggested_priority - a.current_priority);
      const bDiff = Math.abs(b.suggested_priority - b.current_priority);
      return bDiff - aDiff;
    });

    const summary = {
      high_priority_needed: suggestions.filter(s => s.suggested_priority < s.current_priority).length,
      low_priority_needed: suggestions.filter(s => s.suggested_priority > s.current_priority).length,
      no_change_needed: activeTasks.length - suggestions.length,
    };

    return {
      project_id: projectId,
      analyzed_tasks: activeTasks.length,
      suggestions,
      summary,
    };
  }

  /**
   * 태스크 분석을 위한 컨텍스트 정보 수집
   */
  private async gatherTaskContext(task: Task) {
    const [dependencies, dependents, activities, timeSummary] = await Promise.all([
      taskRepo.getDependencies(task.id),
      taskRepo.getDependents(task.id),
      activityRepo.findByTask(task.id, 100),
      timeTrackingService.getTimeSummary(task.id),
    ]);

    // 블로킹 태스크 수 (의존 태스크 중 완료되지 않은 것)
    const blockingTasks = await Promise.all(
      dependencies.map(dep => taskRepo.findById(dep.depends_on))
    );
    const blockingCount = blockingTasks.filter(t => t && t.status !== 'done').length;

    // 의존하는 태스크 수 (이 태스크가 완료되길 기다리는 태스크)
    const dependentTasks = await Promise.all(
      dependents.map(dep => taskRepo.findById(dep.task_id))
    );
    const dependentCount = dependentTasks.filter(t => t && t.status !== 'done').length;

    // in_progress 상태 지속 시간
    let daysInProgress = 0;
    if (task.status === 'in_progress') {
      const lastInProgressChange = activities.reverse().find(a => {
        if (a.action !== 'status_change') return false;
        const p = (typeof a.payload === 'object' && a.payload !== null) ? a.payload as Record<string, unknown> : {};
        return p.to === 'in_progress';
      });

      if (lastInProgressChange) {
        const changeTime = new Date(lastInProgressChange.created_at).getTime();
        daysInProgress = Math.floor((Date.now() - changeTime) / (24 * 60 * 60 * 1000));
      }
    }

    // 에픽 완료율
    let epicCompletionRate = 0;
    if (task.epic_id) {
      const epicTasks = await taskRepo.findByEpic(task.epic_id);
      const totalTasks = epicTasks.length;
      const doneTasks = epicTasks.filter(t => t.status === 'done').length;
      epicCompletionRate = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
    }

    return {
      blockingCount,
      dependentCount,
      daysInProgress,
      epicCompletionRate,
      timeSummary,
      activities,
    };
  }

  /**
   * 우선순위 점수 계산 (0-100)
   * 높은 점수 = 높은 우선순위 필요
   */
  private async calculatePriorityScore(task: Task, context: Awaited<ReturnType<typeof this.gatherTaskContext>>) {
    let score = 50; // 기본 점수
    const reasons: string[] = [];
    const details: PriorityAnalysis['details'] = {};

    // 1. 블로킹 태스크 분석 (의존성이 많으면 우선순위 낮춤)
    if (context.blockingCount > 0) {
      score -= context.blockingCount * 15;
      reasons.push('blocked_dependencies');
      details.blocking_tasks = context.blockingCount;
    }

    // 2. 의존성 체인 분석 (많은 태스크가 의존하면 우선순위 높임)
    if (context.dependentCount > 0) {
      score += context.dependentCount * 10;
      reasons.push('high_demand');
      details.dependent_tasks = context.dependentCount;
    }

    // 3. 예상 시간 대비 진행 분석
    if (task.estimated_hrs && context.timeSummary.total_seconds > 0) {
      const actualHours = context.timeSummary.total_seconds / 3600;
      const overrunHours = actualHours - task.estimated_hrs;
      if (overrunHours > 0) {
        score -= Math.min(overrunHours * 5, 20); // 최대 -20점
        reasons.push('overdue');
        details.estimated_vs_actual = {
          estimated_hrs: task.estimated_hrs,
          actual_hrs: Math.round(actualHours * 100) / 100,
          overrun_hrs: Math.round(overrunHours * 100) / 100,
        };
      }
    }

    // 4. 작업 시간 분석 (오래 방치된 in_progress는 우선순위 높임)
    if (task.status === 'in_progress' && context.daysInProgress >= 7) {
      score += Math.min(context.daysInProgress * 2, 20); // 최대 +20점
      reasons.push('stale_in_progress');
      details.days_in_progress = context.daysInProgress;
    }

    // 5. 에픽 진행률 분석 (완료가 임박한 에픽의 태스크는 우선순위 높임)
    if (context.epicCompletionRate >= 80) {
      score += 15;
      reasons.push('epic_near_completion');
      details.epic_completion_rate = Math.round(context.epicCompletionRate);
    } else if (context.epicCompletionRate >= 50) {
      score += 8;
      reasons.push('epic_half_completed');
      details.epic_completion_rate = Math.round(context.epicCompletionRate);
    }

    // 6. 블로킹 상태 (blocked 상태는 우선순위 대폭 낮춤)
    if (task.status === 'blocked') {
      score -= 30;
      reasons.push('currently_blocked');
    }

    // 7. Review 상태 (리뷰 대기 중인 태스크는 우선순위 높임)
    if (task.status === 'review') {
      score += 12;
      reasons.push('pending_review');
    }

    // 8. Testing/Fixing 상태 (테스트 중인 태스크는 완료 우선)
    if (task.status === 'testing' || task.status === 'fixing') {
      score += 8;
      reasons.push('in_testing_phase');
    }

    // 점수 범위 제한 (0-100)
    score = Math.max(0, Math.min(100, score));

    return { score, reasons, details };
  }

  /**
   * 점수를 우선순위(1-5)로 변환
   */
  private scoreToPriority(score: number): number {
    if (score >= 75) return 1; // 매우 높음
    if (score >= 60) return 2; // 높음
    if (score >= 40) return 3; // 보통
    if (score >= 25) return 4; // 낮음
    return 5; // 매우 낮음
  }

  /**
   * 분석 신뢰도 계산
   */
  private calculateConfidence(context: Awaited<ReturnType<typeof this.gatherTaskContext>>, reasonCount: number): 'high' | 'medium' | 'low' {
    // 많은 데이터 포인트와 이유가 있을수록 신뢰도 높음
    const dataPoints = [
      context.blockingCount > 0,
      context.dependentCount > 0,
      context.daysInProgress > 0,
      context.epicCompletionRate > 0,
      context.timeSummary.total_seconds > 0,
    ].filter(Boolean).length;

    if (dataPoints >= 4 && reasonCount >= 3) return 'high';
    if (dataPoints >= 2 && reasonCount >= 2) return 'medium';
    return 'low';
  }
}
