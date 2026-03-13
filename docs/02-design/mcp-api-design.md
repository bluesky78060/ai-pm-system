# MCP 서버 API 설계 문서

> **PDCA Phase**: Design
> **작성일**: 2026-03-12
> **티켓**: APS-5-8

---

## 1. 아키텍처 개요

### 레이어 구조

```
MCP Client (Claude Code)
    ↓
Tool Layer (index.ts)           ← MCP 프로토콜 처리, 37개 도구 정의
    ↓
Service Layer (15개 서비스)     ← 비즈니스 로직
    ↓
Repository Layer                ← DB 쿼리 추상화
    ↓
PostgreSQL (Render/Neon)
```

### 운영 모드

| 모드 | 환경변수 | 설명 |
|------|----------|------|
| 로컬 모드 | `DATABASE_URL` 설정 | DB 직접 연결 |
| 리모트 모드 | `API_BASE_URL` 설정 | REST API 프록시 경유 |

---

## 2. MCP 도구 카탈로그 (37개)

### 프로젝트 관리 (4개)

| 도구 | 목적 | 필수 파라미터 |
|------|------|--------------|
| `create_project` | 프로젝트 생성 | `name` |
| `get_project` | 프로젝트 조회 | `project_id` |
| `list_projects` | 전체 프로젝트 목록 | — |
| `get_project_status` | 에픽별 진행률 대시보드 | `project_id` |

### 태스크 관리 (8개)

| 도구 | 목적 | 필수 파라미터 |
|------|------|--------------|
| `create_task` | 태스크 생성 | `title`, `epic_id` |
| `get_task` | 태스크 조회 | `task_id` |
| `list_tasks` | 태스크 목록 | `project_id` or `epic_id` |
| `update_task_status` | 상태 직접 변경 (제한적) | `task_id`, `status` |
| `set_priority` | 우선순위 변경 | `task_id`, `priority` |
| `add_dependency` | 의존성 추가 | `task_id`, `depends_on` |
| `decompose_task` | 서브태스크 분해 | `task_id` |
| `create_fix_task` | 수정 태스크 자동 생성 | `parent_id`, `issue` |

### 워크플로우 (1개 - 핵심)

| 도구 | 목적 | 필수 파라미터 |
|------|------|--------------|
| `smart_workflow` | 상태 전환 및 검증 | `task_id`, `action` |

### 컨텍스트 (3개)

| 도구 | 목적 |
|------|------|
| `get_session_context` | 세션 시작 시 컨텍스트 제공 |
| `get_task_activities` | 태스크 활동 이력 |
| `get_project_activities` | 프로젝트 전체 활동 |

### 테스트 & 수정 (5개)

| 도구 | 목적 |
|------|------|
| `run_tests` | 테스트 실행 기록 |
| `report_test_result` | 테스트 결과 리포트 |
| `get_fix_history` | 수정 이력 조회 |
| `get_blocking_analysis` | 블로킹 분석 |
| `sync_commit_progress` | 커밋 진행률 동기화 |

### 분석 & 기타 (16개)

GitHub 연동(4), 분석(1), 자동화(1), 우선순위/워크로드(3), 자동배정(2), 템플릿(3), 내보내기(2)

---

## 3. 핵심 도구 상세

### `create_task`

```typescript
{
  title: string;           // 필수
  epic_id: string;         // 필수 - null 시 대시보드 미노출
  project_id?: string;     // 선택
  description?: string;
  priority?: 1 | 2 | 3 | 4 | 5;  // 기본값 3
  assignee?: "ai" | "human" | string;
}
```

**중요 규칙:**
- `epic_id` 없으면 대시보드에 표시되지 않음
- `project_id`만 있을 경우 "General" 에픽 자동 생성 후 연결

**응답:**
```json
{
  "task": {
    "id": "uuid",
    "ticket_code": "APS-5-4",
    "seq": 4,
    "status": "todo",
    ...
  },
  "message": "태스크 '...' 생성됨"
}
```

---

### `smart_workflow`

```typescript
{
  task_id: string;          // 태스크 ID 또는 ticket_code (APS-5-4)
  action: "start_work" | "submit_test" | "complete_fix" | "approve_review" | "request_changes";
  test_results?: TestResult[];  // submit_test 시 필수
  notes?: string;           // approve_review 시 필수 (20자+)
  issues?: string;          // request_changes 시 필수 (20자+)
}
```

**상태 전환 규칙:**

```
todo ──start_work──→ in_progress
in_progress ──submit_test──→ review  (testing 경유)
review ──approve_review──→ done
review ──request_changes──→ in_progress
in_progress ──complete_fix──→ review
```

**submit_test 검증:**
- `test_results` 배열에 `build` 타입 필수
- `output` 필드 10자 이상
- 빌드 실패 시 `status: "fail"` 포함하여 호출 가능 (고의 실패 제출)

**approve_review 검증:**
- `notes` 20자 이상 실제 리뷰 내용 포함

---

### `get_project_status`

**응답 구조:**
```json
{
  "project": { "id": "...", "name": "...", "code": "APS" },
  "epics": [
    {
      "id": "uuid",
      "title": "에픽명",
      "taskCount": 11,
      "completedCount": 11,
      "rate": 100
    }
  ],
  "summary": {
    "totalEpics": 5,
    "totalTasks": 36,
    "completionRate": 100,
    "statusBreakdown": { "done": 36 }
  }
}
```

---

## 4. 에러 처리 패턴

### 에러 코드 분류 (`classifyError`)

| 코드 | 원인 | 대응 |
|------|------|------|
| `VALIDATION_ERROR` | 필수 파라미터 누락/형식 오류 | 파라미터 확인 |
| `NOT_FOUND` | 존재하지 않는 리소스 | ID 재확인 |
| `CONFLICT` | 상태 전환 불가 | 현재 상태 확인 후 올바른 action 사용 |
| `FORBIDDEN` | 권한 없는 작업 (직접 상태 전환 등) | `smart_workflow` 사용 |
| `INTERNAL_ERROR` | 서버 내부 오류 | 로그 확인 |

### 직접 전환 차단

`update_task_status`로 `testing→review`, `review→done` 직접 전환 시 `FORBIDDEN` 에러 반환.
반드시 `smart_workflow(action="submit_test")` 및 `smart_workflow(action="approve_review")` 사용.

---

## 5. REST API 매핑

웹 UI가 사용하는 REST API (리모트 모드에서도 동일):

| Method | Endpoint | MCP 도구 매핑 |
|--------|----------|---------------|
| GET | `/api/projects` | `list_projects` |
| GET | `/api/projects/:id/status` | `get_project_status` |
| POST | `/api/tasks` | `create_task` |
| GET | `/api/tasks/:id` | `get_task` |
| PUT | `/api/tasks/:id/workflow` | `smart_workflow` |
| GET | `/api/tasks/:id/activities` | `get_task_activities` |
| DELETE | `/api/tasks/:id` | (직접 삭제, 인증 필요) |
