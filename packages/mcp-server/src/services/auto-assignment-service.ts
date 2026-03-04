import { TaskRepository } from '../db/repositories/task-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { UUID_REGEX } from '../utils/code-gen.js';
import type { Task } from '../types/index.js';

const taskRepo = new TaskRepository();
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

// Agent types based on workflow-guide.md
type AgentType =
  | 'executor-low' | 'executor' | 'executor-high'
  | 'designer-low' | 'designer' | 'designer-high'
  | 'build-fixer-low' | 'build-fixer'
  | 'code-reviewer-low' | 'code-reviewer'
  | 'security-reviewer-low' | 'security-reviewer'
  | 'qa-tester' | 'qa-tester-high'
  | 'architect-low' | 'architect'
  | 'explore' | 'explore-medium' | 'explore-high'
  | 'researcher' | 'writer';

type ModelTier = 'haiku' | 'sonnet' | 'opus';

interface AssigneeSuggestion {
  task_id: string;
  ticket_code: string | null;
  title: string;
  current_assignee: string;
  suggested_assignee: AgentType;
  model_tier: ModelTier;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
  context: {
    task_type?: string;
    complexity_score?: number;
    status?: string;
    keywords?: string[];
  };
}

interface ProjectAssignmentRecommendation {
  project_id: string;
  unassigned_count: number;
  recommendations: AssigneeSuggestion[];
  summary: {
    executor_needed: number;
    designer_needed: number;
    reviewer_needed: number;
    other_needed: number;
  };
}

export class AutoAssignmentService {
  /**
   * 단일 태스크의 적절한 에이전트를 추천합니다.
   */
  async suggestAssignee(taskIdOrCode: string): Promise<AssigneeSuggestion> {
    const task = await resolveTask(taskIdOrCode);

    // 컨텍스트 수집
    const context = await this.gatherTaskContext(task);

    // 태스크 유형 및 복잡도 분석
    const analysis = this.analyzeTask(task, context);

    // 적절한 에이전트 선택
    const { agent, model, reasoning } = this.selectAgent(analysis);

    // 신뢰도 계산
    const confidence = this.calculateConfidence(analysis, reasoning.length);

    return {
      task_id: task.id,
      ticket_code: task.ticket_code,
      title: task.title,
      current_assignee: task.assignee,
      suggested_assignee: agent,
      model_tier: model,
      confidence,
      reasoning,
      context: {
        task_type: analysis.type,
        complexity_score: analysis.complexity,
        status: task.status,
        keywords: analysis.keywords,
      },
    };
  }

  /**
   * 프로젝트 전체의 담당자 없는 태스크에 대한 배정 제안을 반환합니다.
   */
  async assignRecommendations(projectId: string): Promise<ProjectAssignmentRecommendation> {
    // 담당자가 없거나 AI인 태스크 조회
    const tasks = await taskRepo.findAll({ project_id: projectId });
    const unassignedTasks = tasks.filter(t => !t.assignee || t.assignee === '' || t.assignee === 'AI');

    const recommendations: AssigneeSuggestion[] = [];

    // N+1 쿼리 최적화: 모든 태스크의 데이터를 배치로 fetch
    const taskIds = unassignedTasks.map(t => t.id);

    // 병렬로 모든 활동 및 의존성 데이터 fetch
    const [allActivities, allDependencies] = await Promise.all([
      Promise.all(taskIds.map(id => activityRepo.findByTask(id, 50))),
      Promise.all(taskIds.map(id => taskRepo.getDependencies(id))),
    ]);

    // 미리 fetch한 데이터를 사용하여 각 태스크 처리 (DB 호출 없음)
    for (let i = 0; i < unassignedTasks.length; i++) {
      const task = unassignedTasks[i];
      const context = {
        activities: allActivities[i],
        dependencies: allDependencies[i],
        hasDescription: !!task.description && task.description.length > 10,
        estimatedHours: task.estimated_hrs || 0,
      };

      // 태스크 분석
      const analysis = this.analyzeTask(task, context);

      // 적절한 에이전트 선택
      const { agent, model, reasoning } = this.selectAgent(analysis);

      // 신뢰도 계산
      const confidence = this.calculateConfidence(analysis, reasoning.length);

      recommendations.push({
        task_id: task.id,
        ticket_code: task.ticket_code,
        title: task.title,
        current_assignee: task.assignee,
        suggested_assignee: agent,
        model_tier: model,
        confidence,
        reasoning,
        context: {
          task_type: analysis.type,
          complexity_score: analysis.complexity,
          status: task.status,
          keywords: analysis.keywords,
        },
      });
    }

    // 신뢰도와 우선순위를 기준으로 정렬
    recommendations.sort((a, b) => {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
      if (confDiff !== 0) return confDiff;

      // 신뢰도가 같으면 상태별 우선순위
      const statusOrder: Record<string, number> = {
        in_progress: 0,
        testing: 1,
        review: 2,
        todo: 3,
        blocked: 4
      };
      const aTask = tasks.find(t => t.id === a.task_id);
      const bTask = tasks.find(t => t.id === b.task_id);
      const aStatus = aTask?.status || 'todo';
      const bStatus = bTask?.status || 'todo';
      return (statusOrder[aStatus] || 99) - (statusOrder[bStatus] || 99);
    });

    // 요약 통계
    const summary = {
      executor_needed: recommendations.filter(r => r.suggested_assignee.startsWith('executor')).length,
      designer_needed: recommendations.filter(r => r.suggested_assignee.startsWith('designer')).length,
      reviewer_needed: recommendations.filter(r =>
        r.suggested_assignee.startsWith('code-reviewer') ||
        r.suggested_assignee.startsWith('security-reviewer')
      ).length,
      other_needed: recommendations.filter(r =>
        !r.suggested_assignee.startsWith('executor') &&
        !r.suggested_assignee.startsWith('designer') &&
        !r.suggested_assignee.startsWith('code-reviewer') &&
        !r.suggested_assignee.startsWith('security-reviewer')
      ).length,
    };

    return {
      project_id: projectId,
      unassigned_count: unassignedTasks.length,
      recommendations,
      summary,
    };
  }

  /**
   * 태스크 분석을 위한 컨텍스트 정보 수집
   */
  private async gatherTaskContext(task: Task) {
    const [activities, dependencies] = await Promise.all([
      activityRepo.findByTask(task.id, 50),
      taskRepo.getDependencies(task.id),
    ]);

    return {
      activities,
      dependencies,
      hasDescription: !!task.description && task.description.length > 10,
      estimatedHours: task.estimated_hrs || 0,
    };
  }

  /**
   * 태스크 유형 및 복잡도 분석
   */
  private analyzeTask(task: Task, context: Awaited<ReturnType<typeof this.gatherTaskContext>>) {
    const text = `${task.title} ${task.description || ''}`.toLowerCase();
    const keywords: string[] = [];

    // 키워드 기반 태스크 유형 분석
    let type = 'general';
    let complexity = 50; // 기본 복잡도

    // UI/Frontend 키워드
    const uiKeywords = ['ui', 'ux', 'component', 'design', 'style', 'css', 'tailwind', 'react', 'vue', 'frontend', '화면', '컴포넌트', '디자인', '스타일'];
    if (uiKeywords.some(kw => text.includes(kw))) {
      type = 'ui';
      keywords.push('ui');
    }

    // API/Backend 키워드
    const apiKeywords = ['api', 'endpoint', 'backend', 'service', 'database', 'db', 'query', 'server', '서버', '엔드포인트', 'api'];
    if (apiKeywords.some(kw => text.includes(kw))) {
      type = type === 'ui' ? 'fullstack' : 'backend';
      keywords.push('backend');
    }

    // 테스트 관련
    const testKeywords = ['test', 'testing', 'qa', 'unit', 'integration', '테스트'];
    if (testKeywords.some(kw => text.includes(kw))) {
      type = 'testing';
      keywords.push('testing');
    }

    // 리뷰 관련
    const reviewKeywords = ['review', 'code review', 'security', '리뷰', '보안', '검토'];
    if (reviewKeywords.some(kw => text.includes(kw))) {
      type = 'review';
      keywords.push('review');
    }

    // 빌드/수정 관련
    const buildKeywords = ['build', 'fix', 'error', 'bug', '빌드', '수정', '에러', '버그'];
    if (buildKeywords.some(kw => text.includes(kw))) {
      type = type === 'general' ? 'bugfix' : type;
      keywords.push('fix');
    }

    // 리팩토링 관련
    const refactorKeywords = ['refactor', 'refactoring', 'restructure', 'architecture', '리팩토링', '아키텍처', '구조 변경'];
    if (refactorKeywords.some(kw => text.includes(kw))) {
      type = 'refactoring';
      keywords.push('refactor');
      complexity += 20; // 리팩토링은 복잡도 높음
    }

    // 복잡도 조정 요소
    // 1. 설명 길이
    if (context.hasDescription) {
      const descLength = task.description?.length || 0;
      if (descLength > 500) complexity += 15;
      else if (descLength > 200) complexity += 10;
    }

    // 2. 예상 시간
    if (context.estimatedHours > 8) complexity += 20;
    else if (context.estimatedHours > 4) complexity += 10;
    else if (context.estimatedHours > 0 && context.estimatedHours <= 1) complexity -= 10;

    // 3. 의존성
    if (context.dependencies.length > 2) complexity += 15;
    else if (context.dependencies.length > 0) complexity += 5;

    // 4. 다중 파일 키워드
    const multiFileKeywords = ['multiple files', 'across', 'throughout', 'system', '전체', '시스템', '여러 파일'];
    if (multiFileKeywords.some(kw => text.includes(kw))) {
      complexity += 20;
    }

    // 복잡도 범위 제한 (0-100)
    complexity = Math.max(0, Math.min(100, complexity));

    return { type, complexity, keywords };
  }

  /**
   * 분석 결과를 바탕으로 적절한 에이전트 선택
   */
  private selectAgent(analysis: { type: string; complexity: number; keywords: string[] }): {
    agent: AgentType;
    model: ModelTier;
    reasoning: string[]
  } {
    const reasoning: string[] = [];
    let agent: AgentType = 'executor';
    let model: ModelTier = 'sonnet';

    // 복잡도 기준
    const isLowComplexity = analysis.complexity < 30;
    const isMediumComplexity = analysis.complexity >= 30 && analysis.complexity < 70;
    const isHighComplexity = analysis.complexity >= 70;

    // 태스크 유형별 에이전트 선택
    switch (analysis.type) {
      case 'ui':
      case 'fullstack':
        if (isHighComplexity) {
          agent = 'designer-high';
          model = 'opus';
          reasoning.push('Complex UI/design system requiring deep design expertise');
        } else if (isLowComplexity) {
          agent = 'designer-low';
          model = 'haiku';
          reasoning.push('Simple UI component changes');
        } else {
          agent = 'designer';
          model = 'sonnet';
          reasoning.push('Standard UI/frontend work');
        }
        break;

      case 'testing':
        agent = 'qa-tester';
        model = 'sonnet';
        reasoning.push('Testing and QA verification needed');
        break;

      case 'review':
        if (analysis.keywords.includes('security')) {
          agent = isHighComplexity ? 'security-reviewer' : 'security-reviewer-low';
          model = isHighComplexity ? 'opus' : 'haiku';
          reasoning.push('Security review required');
        } else {
          agent = isLowComplexity ? 'code-reviewer-low' : 'code-reviewer';
          model = isLowComplexity ? 'haiku' : 'opus';
          reasoning.push('Code quality review needed');
        }
        break;

      case 'bugfix':
        agent = isLowComplexity ? 'build-fixer-low' : 'build-fixer';
        model = isLowComplexity ? 'haiku' : 'sonnet';
        reasoning.push('Bug fix or build error correction');
        break;

      case 'refactoring':
        agent = 'executor-high';
        model = 'opus';
        reasoning.push('Complex refactoring requiring architectural decisions');
        break;

      case 'backend':
      default:
        if (isHighComplexity) {
          agent = 'executor-high';
          model = 'opus';
          reasoning.push('Complex implementation requiring deep reasoning');
        } else if (isLowComplexity) {
          agent = 'executor-low';
          model = 'haiku';
          reasoning.push('Simple code change (1-2 lines or configuration)');
        } else {
          agent = 'executor';
          model = 'sonnet';
          reasoning.push('Standard feature implementation');
        }
        break;
    }

    // 추가 근거
    if (analysis.complexity > 70) {
      reasoning.push(`High complexity score (${analysis.complexity})`);
    } else if (analysis.complexity < 30) {
      reasoning.push(`Low complexity score (${analysis.complexity})`);
    }

    if (analysis.keywords.length > 2) {
      reasoning.push(`Multiple task aspects detected: ${analysis.keywords.join(', ')}`);
    }

    return { agent, model, reasoning };
  }

  /**
   * 분석 신뢰도 계산
   */
  private calculateConfidence(
    analysis: { type: string; complexity: number; keywords: string[] },
    reasoningCount: number
  ): 'high' | 'medium' | 'low' {
    // 키워드가 많고, 유형이 명확하며, 근거가 충분하면 신뢰도 높음
    const hasStrongType = analysis.type !== 'general';
    const hasMultipleKeywords = analysis.keywords.length >= 2;
    const hasStrongReasoning = reasoningCount >= 2;

    if (hasStrongType && hasMultipleKeywords && hasStrongReasoning) return 'high';
    if (hasStrongType && (hasMultipleKeywords || hasStrongReasoning)) return 'medium';
    return 'low';
  }
}
