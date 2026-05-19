# AI 자동 우선순위 조정 기능 (APS-1-8)

## 개요
블로킹 상태, 의존성, 예상 시간, 작업 기록 등을 분석하여 태스크 우선순위를 AI가 자동으로 제안하는 기능입니다.

## 구현된 기능

### 1. PriorityRecommendationService
**위치**: `packages/mcp-server/src/services/priority-recommendation-service.ts`

#### 주요 메서드:
- `analyzePriority(taskIdOrCode)`: 단일 태스크 우선순위 분석 및 제안
- `suggestPriorityAdjustments(projectId)`: 프로젝트 전체 우선순위 제안
- `calculatePriorityScore(task, context)`: 우선순위 점수 계산 (0-100)

#### 분석 요소:
1. **블로킹 태스크**: 의존하는 태스크가 완료되지 않으면 우선순위 낮춤 (최대 -15점/건)
2. **의존성 체인**: 많은 태스크가 의존하면 우선순위 높임 (최대 +10점/건)
3. **예상 시간 대비 진행**: 예상 시간 초과 시 우선순위 낮춤 (최대 -20점)
4. **작업 시간**: 7일 이상 in_progress 상태 방치 시 우선순위 높임 (최대 +20점)
5. **에픽 진행률**: 80% 이상 완료된 에픽의 태스크는 우선순위 높임 (+15점)
6. **현재 상태**:
   - blocked: -30점
   - review: +12점
   - testing/fixing: +8점

### 2. API 엔드포인트
**위치**: `packages/mcp-server/src/api-server.ts`

#### 추가된 엔드포인트:
- `GET /api/tasks/:id/priority-analysis`: 단일 태스크 우선순위 분석
- `GET /api/projects/:id/priority-suggestions`: 프로젝트 전체 우선순위 제안

### 3. MCP 도구
**위치**: `packages/mcp-server/src/index.ts`

#### 추가된 도구:
- `analyze_task_priority`: 태스크 우선순위 분석
  - 입력: `task_id` (태스크 ID 또는 티켓 코드)
  - 출력: 점수, 제안 우선순위, 이유, 신뢰도, 상세 정보

- `get_priority_suggestions`: 프로젝트 우선순위 제안 목록
  - 입력: `project_id`
  - 출력: 모든 활성 태스크의 우선순위 조정 제안

## 응답 형식

### 단일 태스크 분석 (PriorityAnalysis)
```typescript
{
  task_id: string;
  ticket_code: string | null;
  title: string;
  current_priority: number;        // 현재 우선순위 (1-5)
  suggested_priority: number;      // 제안 우선순위 (1-5)
  score: number;                   // 계산된 점수 (0-100)
  reasons: string[];               // 이유 목록
  confidence: "high" | "medium" | "low";  // 신뢰도
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
```

### 프로젝트 전체 제안 (ProjectPrioritySuggestion)
```typescript
{
  project_id: string;
  analyzed_tasks: number;
  suggestions: PriorityAnalysis[];  // 우선순위 변경이 필요한 태스크만
  summary: {
    high_priority_needed: number;   // 우선순위를 높여야 하는 태스크 수
    low_priority_needed: number;    // 우선순위를 낮춰야 하는 태스크 수
    no_change_needed: number;       // 변경이 필요 없는 태스크 수
  };
}
```

## 우선순위 이유 코드 (reasons)
- `blocked_dependencies`: 블로킹 의존성 존재
- `high_demand`: 많은 태스크가 의존
- `overdue`: 예상 시간 초과
- `stale_in_progress`: 오래 방치된 in_progress
- `epic_near_completion`: 에픽 완료 임박 (80%+)
- `epic_half_completed`: 에픽 절반 완료 (50%+)
- `currently_blocked`: 블로킹 상태
- `pending_review`: 리뷰 대기 중
- `in_testing_phase`: 테스트/수정 중

## 점수 → 우선순위 변환
- 75-100점: 우선순위 1 (매우 높음)
- 60-74점: 우선순위 2 (높음)
- 40-59점: 우선순위 3 (보통)
- 25-39점: 우선순위 4 (낮음)
- 0-24점: 우선순위 5 (매우 낮음)

## 신뢰도 계산
- **High**: 4개 이상 데이터 포인트 + 3개 이상 이유
- **Medium**: 2개 이상 데이터 포인트 + 2개 이상 이유
- **Low**: 데이터 부족

## 테스트
**위치**: `packages/mcp-server/src/__tests__/priority-recommendation.test.ts`

15개의 단위 테스트로 점수 계산 로직 검증:
- 우선순위 변환 (5개 테스트)
- 신뢰도 계산 (3개 테스트)
- 점수 계산 로직 (7개 테스트)

## 사용 예시

### MCP 도구 사용
```typescript
// 단일 태스크 분석
const analysis = await mcp.call_tool("analyze_task_priority", {
  task_id: "APS-1-8"
});

// 프로젝트 전체 제안
const suggestions = await mcp.call_tool("get_priority_suggestions", {
  project_id: "3bc28444-2e96-4587-be23-4c48e220aa66"
});
```

### REST API 사용
```bash
# 단일 태스크 분석
curl http://localhost:3001/api/tasks/APS-1-8/priority-analysis

# 프로젝트 전체 제안
curl http://localhost:3001/api/projects/3bc28444-2e96-4587-be23-4c48e220aa66/priority-suggestions
```

## 빌드 및 테스트 결과
- ✅ TypeScript 컴파일 성공
- ✅ 15개 단위 테스트 통과
- ✅ API 서버 통합 완료
- ✅ MCP 도구 등록 완료
