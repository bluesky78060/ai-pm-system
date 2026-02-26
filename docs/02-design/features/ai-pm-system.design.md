# ai-pm-system Design Document

> **Summary**: MCP 기반 AI 자율 개발 프로젝트 관리 시스템 - 상세 설계
>
> **Project**: ai-pm-system
> **Version**: v1.0
> **Author**: leechanhee
> **Date**: 2026-02-26
> **Status**: Draft
> **Planning Doc**: [ai-pm-system.plan.md](../01-plan/features/ai-pm-system.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- MCP 도구 15개의 완전한 구현 및 Claude Code 연동
- SQLite 기반 로컬 데이터 영속성 (서버 불필요)
- AI 자율 테스트/수정 루프의 안정적 동작
- Web 대시보드를 통한 사람의 모니터링 인터페이스
- 모노레포 구조에서 패키지 간 명확한 책임 분리

### 1.2 Design Principles

- **단일 책임 원칙**: 각 MCP 도구는 하나의 명확한 역할만 수행
- **서비스 레이어 패턴**: Tool → Service → Repository → DB 계층 분리
- **타입 안전성**: TypeScript strict 모드, 공유 타입 패키지
- **로컬 우선**: 외부 서비스 의존 최소화 (GitHub 연동은 선택적)
- **점진적 확장**: Phase 1~5 단계별 기능 추가 가능한 아키텍처

### 1.3 Open Decisions Resolved

| ID | 결정 사항 | 결정 | 근거 |
|----|---------|------|------|
| OD-01 | Web UI ↔ 서버 통신 | **REST API** | MVP에 충분, 단순한 구조 |
| OD-02 | 다중 프로젝트 | **멀티 프로젝트** | DB 스키마가 이미 project_id 기반 |
| OD-03 | 로그 보존 정책 | **90일 + 아카이브** | 일상 사용 충분, 디스크 절약 |
| OD-04 | GitHub 인증 | **PAT (Personal Access Token)** | MVP 단순성, 환경변수 하나로 설정 |
| OD-05 | Web UI 인증 | **없음 (로컬 전용)** | v1.0은 로컬 머신에서만 사용 |

---

## 2. Architecture

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     AI Agents                            │
│              (Claude Code, Cursor 등)                    │
└──────────────────┬──────────────────────────────────────┘
                   │ stdio (MCP Protocol)
                   ▼
┌─────────────────────────────────────────────────────────┐
│                  MCP Server (Node.js)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Context  │  │  Task    │  │ GitHub   │  │  Test  │ │
│  │  Tools   │  │  Tools   │  │  Tools   │  │ Tools  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │              │              │             │      │
│  ┌────▼──────────────▼──────────────▼─────────────▼───┐ │
│  │              Service Layer                          │ │
│  │  ProjectService | TaskService | GitHubService       │ │
│  │  ContextService | TestService | PriorityEngine      │ │
│  └────────────────────┬────────────────────────────────┘ │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────────┐ │
│  │              Repository Layer                        │ │
│  │  ProjectRepo | TaskRepo | EpicRepo | ActivityRepo    │ │
│  └────────────────────┬────────────────────────────────┘ │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────────┐ │
│  │              SQLite (better-sqlite3)                  │ │
│  │              data/pm.db (WAL mode)                   │ │
│  └─────────────────────────────────────────────────────┘ │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────────┐ │
│  │           Express HTTP Server (:3100)                │ │
│  │           REST API for Web UI                        │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                   │ REST API
                   ▼
┌─────────────────────────────────────────────────────────┐
│               Web Dashboard (React + Vite)               │
│           http://localhost:5173                           │
└─────────────────────────────────────────────────────────┘
```

### 2.2 프로세스 구조

MCP 서버는 **두 가지 인터페이스**를 동시에 제공합니다:

| 인터페이스 | 프로토콜 | 대상 | 포트 |
|-----------|---------|------|------|
| MCP Tools | stdio | AI 에이전트 | N/A (stdin/stdout) |
| REST API | HTTP | Web Dashboard | 3100 |

```
하나의 Node.js 프로세스:
├── MCP Server (stdio) ─── AI 에이전트용
└── Express Server (:3100) ─── Web UI용

두 인터페이스 모두 동일한 Service/Repository 레이어 공유
```

### 2.3 Data Flow

#### AI 에이전트 → MCP Tool 호출

```
AI Agent
  │ MCP Protocol (stdio)
  ▼
MCP Tool Handler (tools/task-tools.ts)
  │ 파라미터 검증
  ▼
TaskService (services/task-service.ts)
  │ 비즈니스 로직 (우선순위 계산, 의존성 체크)
  ▼
TaskRepository (db/repositories/task-repo.ts)
  │ SQL 쿼리 실행
  ▼
SQLite (better-sqlite3)
  │ 결과 반환
  ▲
TaskService
  │ 활동 로그 기록
  ▼
ActivityRepository → SQLite
```

#### Web UI → REST API 호출

```
React Component
  │ fetch('/api/tasks')
  ▼
Express Router (routes/task-routes.ts)
  │ 파라미터 검증
  ▼
TaskService (동일한 서비스 레이어 재사용)
  │
  ▼
TaskRepository → SQLite
```

### 2.4 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| MCP Tools | Service Layer | 비즈니스 로직 위임 |
| Express Routes | Service Layer | 동일한 로직 재사용 |
| Service Layer | Repository Layer | 데이터 접근 추상화 |
| Repository Layer | better-sqlite3 | SQLite 쿼리 실행 |
| GitHubService | Octokit | GitHub API 호출 |
| PriorityEngine | TaskRepository | 의존성 그래프 조회 |
| TestService | child_process | 테스트 명령어 실행 |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
// === Core Entities ===

interface Project {
  id: string;            // UUID v4
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  githubRepo: string | null;   // "owner/repo"
  createdAt: string;     // ISO 8601
  updatedAt: string;
}

interface Epic {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: number;      // 1(높음) ~ 5(낮음)
  orderIndex: number;
  createdAt: string;
}

interface Task {
  id: string;
  epicId: string | null;
  parentId: string | null;      // 서브태스크 부모
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;             // 1 ~ 5
  assignee: 'ai' | 'human' | string;
  githubIssue: string | null;   // Issue URL
  githubPr: string | null;      // PR URL
  estimatedHrs: number | null;
  actualHrs: number | null;
  blockedBy: string | null;     // 블로킹 이유 텍스트
  createdBy: 'ai' | 'human';
  createdAt: string;
  completedAt: string | null;
}

type TaskStatus = 'todo' | 'in_progress' | 'testing' | 'fixing' | 'review' | 'done' | 'blocked';

// === Test & Fix Entities ===

interface TestRun {
  id: string;
  taskId: string;
  runNumber: number;     // 1, 2, 3
  testType: 'unit' | 'type' | 'lint' | 'integration' | 'build';
  status: 'pass' | 'fail' | 'skip';
  output: string | null;
  failures: TestFailure[] | null;  // JSON
  durationMs: number | null;
  createdAt: string;
}

interface TestFailure {
  file: string;
  line: number | null;
  message: string;
}

interface FixAttempt {
  id: string;
  taskId: string;
  attemptNumber: number;  // 최대 3
  triggerRunId: string;
  filesChanged: FileChange[] | null;  // JSON
  fixDescription: string;
  resultStatus: 'pass' | 'fail' | 'escalated';
  createdAt: string;
}

interface FileChange {
  path: string;
  diff: string;
}

// === Activity Log ===

interface ActivityLog {
  id: number;            // AUTOINCREMENT
  taskId: string | null;
  actor: 'ai' | 'human' | 'github';
  action: 'create' | 'update' | 'status_change' | 'comment' | 'test_run' | 'fix_attempt' | 'escalate';
  payload: Record<string, unknown> | null;  // JSON
  createdAt: string;
}

// === Task Dependency ===

interface TaskDependency {
  taskId: string;
  dependsOn: string;
}
```

### 3.2 Entity Relationships

```
[Project] 1 ──── N [Epic]
                    │
                    └── 1 ──── N [Task]
                                  │
                                  ├── 1 ──── N [Task] (self-ref: subtasks)
                                  │
                                  ├── N ──── M [Task] (via task_dependencies)
                                  │
                                  ├── 1 ──── N [TestRun]
                                  │
                                  ├── 1 ──── N [FixAttempt]
                                  │
                                  └── 1 ──── N [ActivityLog]
```

### 3.3 Database Schema (SQLite DDL)

```sql
-- 초기화: WAL 모드 + FK 활성화
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- =====================
-- 프로젝트
-- =====================
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active', 'archived')),
  github_repo TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- 에픽
-- =====================
CREATE TABLE epics (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK(status IN ('todo', 'in_progress', 'done')),
  priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_epics_project ON epics(project_id);

-- =====================
-- 태스크
-- =====================
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  epic_id       TEXT REFERENCES epics(id) ON DELETE SET NULL,
  parent_id     TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'todo'
                CHECK(status IN ('todo', 'in_progress', 'testing', 'fixing', 'review', 'done', 'blocked')),
  priority      INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  assignee      TEXT NOT NULL DEFAULT 'ai',
  github_issue  TEXT,
  github_pr     TEXT,
  estimated_hrs REAL,
  actual_hrs    REAL,
  blocked_by    TEXT,
  created_by    TEXT NOT NULL DEFAULT 'human'
                CHECK(created_by IN ('ai', 'human')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE INDEX idx_tasks_epic ON tasks(epic_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);

-- =====================
-- 태스크 의존성
-- =====================
CREATE TABLE task_dependencies (
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on),
  CHECK(task_id != depends_on)
);

-- =====================
-- 활동 로그
-- =====================
CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  actor      TEXT NOT NULL CHECK(actor IN ('ai', 'human', 'github')),
  action     TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_task ON activity_log(task_id);
CREATE INDEX idx_activity_created ON activity_log(created_at);

-- =====================
-- 테스트 실행
-- =====================
CREATE TABLE test_runs (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_number   INTEGER NOT NULL,
  test_type    TEXT NOT NULL
               CHECK(test_type IN ('unit', 'type', 'lint', 'integration', 'build')),
  status       TEXT NOT NULL
               CHECK(status IN ('pass', 'fail', 'skip')),
  output       TEXT,
  failures     TEXT,
  duration_ms  INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_test_runs_task ON test_runs(task_id);

-- =====================
-- 수정 시도
-- =====================
CREATE TABLE fix_attempts (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt_number  INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 3),
  trigger_run_id  TEXT REFERENCES test_runs(id),
  files_changed   TEXT,
  fix_description TEXT,
  result_status   TEXT NOT NULL
                  CHECK(result_status IN ('pass', 'fail', 'escalated')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fix_attempts_task ON fix_attempts(task_id);
```

---

## 4. MCP Tool Specification

### 4.1 Tool Overview

총 17개 도구 (기존 15개 + REST 서버 제어 2개)

| 카테고리 | 도구 | 설명 |
|---------|------|------|
| **Context** | `get_session_context` | 세션 시작 컨텍스트 |
| | `get_project_status` | 프로젝트 대시보드 |
| | `get_blocking_analysis` | 블로킹 분석 |
| **Task** | `create_task` | 태스크 생성 |
| | `decompose_task` | 서브태스크 분해 |
| | `update_task_status` | 상태 업데이트 |
| | `set_priority` | 우선순위 조정 |
| | `add_dependency` | 의존성 추가 |
| **GitHub** | `link_pr_to_task` | PR 연결 |
| | `get_pr_status` | PR 상태 조회 |
| | `create_github_issue` | Issue 생성 |
| | `sync_commit_progress` | 커밋 반영 |
| **Test** | `run_tests` | 테스트 실행 |
| | `report_test_result` | 결과 기록 |
| | `create_fix_task` | 수정 태스크 생성 |
| | `get_fix_history` | 수정 이력 조회 |
| | `escalate_to_human` | 에스컬레이션 |

### 4.2 Context Tools - Detailed Spec

#### `get_session_context`

```typescript
// Input
interface GetSessionContextInput {
  project_id: string;
}

// Output
interface SessionContext {
  project: {
    id: string;
    name: string;
    status: string;
    githubRepo: string | null;
  };
  currentTasks: {
    inProgress: Task[];
    testing: Task[];
    blocked: Task[];
  };
  recentlyCompleted: {
    tasks: Task[];
    lastCompletedAt: string | null;
  };
  progress: {
    totalTasks: number;
    completed: number;
    inProgress: number;
    blocked: number;
    completionRate: number;       // 0~100
    byEpic: EpicProgress[];
  };
  blockingAnalysis: {
    blockedTasks: BlockedTaskInfo[];
    suggestions: string[];
  };
  nextRecommended: {
    task: Task;
    reason: string;               // "높은 우선순위", "의존성 해소됨" 등
  } | null;
}

interface EpicProgress {
  epicId: string;
  epicTitle: string;
  total: number;
  completed: number;
  rate: number;
}

interface BlockedTaskInfo {
  task: Task;
  blockedBy: string;
  duration: string;               // "2일 전부터 블로킹"
  suggestion: string;
}
```

#### `get_project_status`

```typescript
// Input
interface GetProjectStatusInput {
  project_id: string;
}

// Output
interface ProjectStatus {
  project: Project;
  epics: (Epic & {
    taskCount: number;
    completedCount: number;
    rate: number;
  })[];
  summary: {
    totalEpics: number;
    totalTasks: number;
    completionRate: number;
    statusBreakdown: Record<TaskStatus, number>;
  };
}
```

#### `get_blocking_analysis`

```typescript
// Input
interface GetBlockingAnalysisInput {
  project_id: string;
}

// Output
interface BlockingAnalysis {
  blockedTasks: {
    task: Task;
    blockedSince: string;
    blockedBy: string;
    dependencyChain: string[];    // 의존성 체인 추적
    suggestedAction: string;
  }[];
  criticalPath: Task[];           // 병목 경로
  recommendations: string[];
}
```

### 4.3 Task Tools - Detailed Spec

#### `create_task`

```typescript
// Input
interface CreateTaskInput {
  title: string;
  epic_id?: string;
  project_id: string;
  description?: string;
  priority?: number;        // 기본: 3
  assignee?: string;        // 기본: 'ai'
  parent_id?: string;       // 서브태스크인 경우
}

// Output
interface CreateTaskOutput {
  task: Task;
  message: string;          // "태스크 'JWT 구현' 생성됨"
}
```

#### `decompose_task`

```typescript
// Input
interface DecomposeTaskInput {
  task_id: string;
  subtasks: {
    title: string;
    description?: string;
    priority?: number;
    estimated_hrs?: number;
  }[];
}

// Output
interface DecomposeTaskOutput {
  parentTask: Task;
  subtasks: Task[];
  message: string;
}
```

#### `update_task_status`

```typescript
// Input
interface UpdateTaskStatusInput {
  task_id: string;
  status: TaskStatus;
  notes?: string;
}

// Output
interface UpdateTaskStatusOutput {
  task: Task;
  previousStatus: TaskStatus;
  message: string;
}

// 상태 전환 규칙
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  'todo':        ['in_progress', 'blocked'],
  'in_progress': ['testing', 'blocked', 'todo'],
  'testing':     ['fixing', 'review', 'blocked'],
  'fixing':      ['testing', 'blocked'],
  'review':      ['done', 'in_progress'],
  'done':        ['in_progress'],   // 재오픈
  'blocked':     ['todo', 'in_progress'],
};
```

#### `set_priority`

```typescript
// Input
interface SetPriorityInput {
  task_id: string;
  priority: number;       // 1~5
  reason: string;         // AI가 조정 이유 기록
}

// Output: { task: Task, previousPriority: number, message: string }
```

#### `add_dependency`

```typescript
// Input
interface AddDependencyInput {
  task_id: string;
  depends_on_id: string;
}

// Output: { dependency: TaskDependency, message: string }
// 순환 의존성 감지 시 에러 반환
```

### 4.4 GitHub Tools - Detailed Spec

#### `link_pr_to_task`

```typescript
// Input
interface LinkPrInput {
  task_id: string;
  pr_url: string;        // "https://github.com/owner/repo/pull/123"
}
// → task.github_pr 업데이트 + 활동 로그 기록
```

#### `get_pr_status`

```typescript
// Input: { task_id: string }
// Output
interface PrStatus {
  task: Task;
  pr: {
    url: string;
    state: 'open' | 'closed' | 'merged';
    title: string;
    reviewStatus: 'pending' | 'approved' | 'changes_requested';
    checks: { name: string; status: string }[];
  } | null;
}
```

#### `create_github_issue`

```typescript
// Input: { task_id: string }
// → Octokit으로 Issue 생성, task.github_issue 업데이트
// Output: { task: Task, issueUrl: string, message: string }
```

#### `sync_commit_progress`

```typescript
// Input: { task_id: string, commit_hash: string }
// → 활동 로그에 커밋 기록, actual_hrs 업데이트
// Output: { task: Task, message: string }
```

### 4.5 Test Tools - Detailed Spec

#### `run_tests`

```typescript
// Input
interface RunTestsInput {
  task_id: string;
  test_types: ('unit' | 'type' | 'lint' | 'integration' | 'build')[];
  working_dir?: string;
}

// 내부 동작: child_process.execSync로 각 테스트 실행
const TEST_COMMANDS: Record<string, string> = {
  unit: 'pnpm vitest run',
  type: 'pnpm tsc --noEmit',
  lint: 'pnpm biome check',
  integration: 'pnpm vitest run --config vitest.integration.config.ts',
  build: 'pnpm build',
};

// Output
interface RunTestsOutput {
  taskId: string;
  results: TestRun[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  allPassed: boolean;
}
```

#### `report_test_result`

```typescript
// Input
interface ReportTestResultInput {
  task_id: string;
  result: 'pass' | 'fail';
  failures?: TestFailure[];
}

// 동작:
// - pass → task.status = 'review'
// - fail → task.status = 'fixing', 수정 카운트 체크
// Output: { task: Task, nextAction: string }
```

#### `create_fix_task`

```typescript
// Input
interface CreateFixTaskInput {
  parent_task_id: string;
  issue_description: string;
}
// → 수정 서브태스크 자동 생성, parent.status = 'fixing'
```

#### `get_fix_history`

```typescript
// Input: { task_id: string }
// Output: { testRuns: TestRun[], fixAttempts: FixAttempt[], totalAttempts: number }
```

#### `escalate_to_human`

```typescript
// Input
interface EscalateInput {
  task_id: string;
  reason: string;
  attempts: number;
}
// → task.status = 'blocked', task.assignee = 'human'
// → task.blocked_by = reason
// → 활동 로그에 에스컬레이션 기록
```

---

## 5. REST API Specification (Web UI용)

### 5.1 Endpoint List

Express 서버 (:3100)가 제공하는 REST API:

| Method | Path | Description |
|--------|------|-------------|
| **Projects** | | |
| GET | `/api/projects` | 프로젝트 목록 |
| GET | `/api/projects/:id` | 프로젝트 상세 |
| POST | `/api/projects` | 프로젝트 생성 |
| PUT | `/api/projects/:id` | 프로젝트 수정 |
| **Epics** | | |
| GET | `/api/projects/:projectId/epics` | 에픽 목록 |
| POST | `/api/projects/:projectId/epics` | 에픽 생성 |
| PUT | `/api/epics/:id` | 에픽 수정 |
| **Tasks** | | |
| GET | `/api/tasks` | 태스크 목록 (필터: epic_id, status, assignee) |
| GET | `/api/tasks/:id` | 태스크 상세 (서브태스크, 의존성 포함) |
| POST | `/api/tasks` | 태스크 생성 |
| PUT | `/api/tasks/:id` | 태스크 수정 |
| PUT | `/api/tasks/:id/status` | 상태 변경 |
| **Dashboard** | | |
| GET | `/api/dashboard/:projectId` | 대시보드 데이터 |
| GET | `/api/dashboard/:projectId/blocking` | 블로킹 분석 |
| **Activity** | | |
| GET | `/api/activity` | 활동 로그 (필터: task_id, actor, limit) |
| **Tests** | | |
| GET | `/api/tasks/:taskId/tests` | 테스트 이력 |
| GET | `/api/tasks/:taskId/fixes` | 수정 이력 |

### 5.2 Error Response Format

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "태스크를 찾을 수 없습니다",
    "details": { "taskId": "abc-123" }
  }
}
```

### 5.3 Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| `VALIDATION_ERROR` | 400 | 입력값 검증 실패 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `INVALID_TRANSITION` | 409 | 잘못된 상태 전환 |
| `CIRCULAR_DEPENDENCY` | 409 | 순환 의존성 감지 |
| `MAX_FIX_ATTEMPTS` | 409 | 최대 수정 횟수 초과 |
| `GITHUB_ERROR` | 502 | GitHub API 오류 |
| `INTERNAL_ERROR` | 500 | 내부 서버 오류 |

---

## 6. UI/UX Design

### 6.1 Web Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│  🤖 AI PM System          [Project Selector ▼]      │
├────────┬────────────────────────────────────────────┤
│        │                                             │
│  Nav   │  Main Content                              │
│        │                                             │
│  📊    │  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  Dash  │  │ Total   │ │ In Prog │ │ Blocked │     │
│        │  │   42    │ │    8    │ │    3    │     │
│  📋    │  └─────────┘ └─────────┘ └─────────┘     │
│  Tasks │                                             │
│        │  ┌─────────────────────────────────────┐   │
│  🏷️    │  │  Epic Progress Chart                │   │
│  Epics │  │  ████████░░ 80%  사용자 인증         │   │
│        │  │  ██████░░░░ 60%  API 서버            │   │
│  📝    │  │  ██░░░░░░░░ 20%  대시보드            │   │
│  Log   │  └─────────────────────────────────────┘   │
│        │                                             │
│  🧪    │  ┌─────────────────────────────────────┐   │
│  Tests │  │  Recent Activity                     │   │
│        │  │  🤖 AI: JWT 토큰 발급 구현 완료      │   │
│        │  │  🤖 AI: 테스트 실행 → 2/3 통과       │   │
│        │  │  👤 Human: 에픽 우선순위 조정         │   │
│        │  └─────────────────────────────────────┘   │
│        │                                             │
├────────┴────────────────────────────────────────────┤
│  Status: Connected │ Last Sync: 2s ago              │
└─────────────────────────────────────────────────────┘
```

### 6.2 Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | 프로젝트 진행률, 에픽 차트, 최근 활동 |
| Tasks | `/tasks` | 태스크 목록 (필터, 검색, 상태별 칸반 뷰) |
| Task Detail | `/tasks/:id` | 태스크 상세, 서브태스크, 테스트 이력, 수정 이력 |
| Epics | `/epics` | 에픽 목록 및 진행률 |
| Activity | `/activity` | 전체 활동 로그 타임라인 |
| Test Results | `/tests` | 테스트 실행 결과 및 수정 이력 |

### 6.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `DashboardPage` | `pages/Dashboard.tsx` | 전체 현황 대시보드 |
| `TaskListPage` | `pages/TaskList.tsx` | 태스크 목록 + 필터 |
| `TaskDetailPage` | `pages/TaskDetail.tsx` | 태스크 상세 정보 |
| `ProgressBar` | `components/ProgressBar.tsx` | 에픽/태스크 진행률 바 |
| `StatusBadge` | `components/StatusBadge.tsx` | 상태 배지 (색상 코딩) |
| `ActivityTimeline` | `components/ActivityTimeline.tsx` | 활동 로그 타임라인 |
| `TestResultCard` | `components/TestResultCard.tsx` | 테스트 결과 카드 |
| `KanbanBoard` | `components/KanbanBoard.tsx` | 칸반 보드 (상태별) |
| `ProjectSelector` | `components/ProjectSelector.tsx` | 프로젝트 선택 드롭다운 |

---

## 7. Security Considerations

- [x] Input validation: MCP 도구 파라미터 검증 (zod 스키마)
- [x] SQL Injection: better-sqlite3 prepared statements 사용
- [ ] GitHub PAT: 환경변수로 관리, `.env`에 저장, `.gitignore` 추가
- [x] 로컬 전용: Web UI 인증 불필요 (localhost만 바인딩)
- [ ] Rate Limiting: Express에 express-rate-limit 미들웨어 (선택적)

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Coverage Goal |
|------|--------|------|--------------|
| Unit Test | Service Layer, Repository Layer | Vitest | 80% |
| Unit Test | MCP Tool Handlers | Vitest | 70% |
| Integration Test | REST API Endpoints | Vitest + supertest | 주요 경로 |
| E2E Test | Web Dashboard 주요 시나리오 | Playwright | 핵심 플로우 |

### 8.2 Test Cases (Key)

- [ ] **Happy path**: 태스크 생성 → 상태 변경 → 테스트 → 완료 전체 플로우
- [ ] **Happy path**: `get_session_context`가 정확한 데이터 반환
- [ ] **Error case**: 잘못된 상태 전환 시 INVALID_TRANSITION 에러
- [ ] **Error case**: 순환 의존성 추가 시 CIRCULAR_DEPENDENCY 에러
- [ ] **Edge case**: 3회 수정 실패 후 에스컬레이션
- [ ] **Edge case**: 비어있는 프로젝트에서 `get_session_context` 호출
- [ ] **Concurrency**: MCP와 REST 동시 접근 시 데이터 무결성

---

## 9. Clean Architecture

### 9.1 Layer Structure

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Tool/Route** | 요청 수신, 파라미터 검증, 응답 포맷팅 | `src/tools/`, `src/routes/` |
| **Service** | 비즈니스 로직, 트랜잭션, 이벤트 발행 | `src/services/` |
| **Repository** | 데이터 접근, SQL 쿼리, 캐싱 | `src/db/repositories/` |
| **Domain** | 엔티티 타입, 상수, 검증 규칙 | `src/types/` |

### 9.2 Dependency Rules

```
┌───────────────────────────────────────────────────────┐
│                 Dependency Direction                    │
├───────────────────────────────────────────────────────┤
│                                                        │
│   Tool/Route ──→ Service ──→ Repository ──→ SQLite    │
│       │              │              │                  │
│       └── Types ◄────┴──────────────┘                 │
│                                                        │
│   Rule: 상위 레이어만 하위 레이어에 의존               │
│         Types (Domain)는 어디서든 참조 가능            │
└───────────────────────────────────────────────────────┘
```

### 9.3 File Import Rules

| From | Can Import | Cannot Import |
|------|-----------|---------------|
| Tool/Route | Service, Types | Repository 직접 접근 불가 |
| Service | Repository, Types | Tool/Route |
| Repository | Types, better-sqlite3 | Service, Tool/Route |
| Types | 없음 (순수 타입) | 모든 외부 레이어 |

---

## 10. Coding Convention

### 10.1 Naming Conventions

| Target | Rule | Example |
|--------|------|---------|
| MCP 도구 이름 | snake_case | `get_session_context`, `create_task` |
| 함수/메서드 | camelCase | `getSessionContext()`, `createTask()` |
| 클래스 | PascalCase | `TaskService`, `TaskRepository` |
| 인터페이스/타입 | PascalCase | `Task`, `CreateTaskInput` |
| 상수 | UPPER_SNAKE_CASE | `MAX_FIX_ATTEMPTS`, `VALID_TRANSITIONS` |
| 파일 (서비스) | kebab-case.ts | `task-service.ts`, `project-repo.ts` |
| 컴포넌트 파일 | PascalCase.tsx | `Dashboard.tsx`, `TaskList.tsx` |
| 폴더 | kebab-case | `mcp-server/`, `web-ui/` |
| DB 컬럼 | snake_case | `created_at`, `github_pr` |

### 10.2 Import Order

```typescript
// 1. Node.js built-in
import path from 'node:path';

// 2. External packages
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import Database from 'better-sqlite3';

// 3. Internal absolute
import { TaskService } from '../services/task-service.js';

// 4. Types
import type { Task, CreateTaskInput } from '../types/index.js';
```

### 10.3 Environment Variables

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `DB_PATH` | SQLite DB 파일 경로 | No | `./data/pm.db` |
| `HTTP_PORT` | Express 서버 포트 | No | `3100` |
| `GITHUB_TOKEN` | GitHub PAT | No | (GitHub 연동 비활성화) |
| `GITHUB_REPO` | 대상 저장소 | No | (GitHub 연동 비활성화) |
| `LOG_LEVEL` | 로그 레벨 | No | `info` |

---

## 11. Implementation Guide

### 11.1 File Structure

```
ai-pm-system/
├── packages/
│   ├── mcp-server/
│   │   ├── src/
│   │   │   ├── index.ts              # MCP 서버 + Express 서버 진입점
│   │   │   ├── tools/
│   │   │   │   ├── context-tools.ts   # get_session_context, get_project_status, get_blocking_analysis
│   │   │   │   ├── task-tools.ts      # create_task, decompose_task, update_task_status, set_priority, add_dependency
│   │   │   │   ├── github-tools.ts    # link_pr_to_task, get_pr_status, create_github_issue, sync_commit_progress
│   │   │   │   └── test-tools.ts      # run_tests, report_test_result, create_fix_task, get_fix_history, escalate_to_human
│   │   │   ├── services/
│   │   │   │   ├── project-service.ts
│   │   │   │   ├── task-service.ts
│   │   │   │   ├── context-service.ts
│   │   │   │   ├── test-service.ts
│   │   │   │   ├── github-service.ts
│   │   │   │   └── priority-engine.ts # 우선순위 계산 + 다음 태스크 추천
│   │   │   ├── routes/
│   │   │   │   ├── project-routes.ts
│   │   │   │   ├── task-routes.ts
│   │   │   │   ├── dashboard-routes.ts
│   │   │   │   ├── activity-routes.ts
│   │   │   │   └── test-routes.ts
│   │   │   ├── db/
│   │   │   │   ├── connection.ts      # SQLite 연결 관리 (싱글톤)
│   │   │   │   ├── migrate.ts         # 스키마 마이그레이션
│   │   │   │   └── repositories/
│   │   │   │       ├── project-repo.ts
│   │   │   │       ├── epic-repo.ts
│   │   │   │       ├── task-repo.ts
│   │   │   │       ├── activity-repo.ts
│   │   │   │       └── test-repo.ts
│   │   │   └── types/
│   │   │       ├── index.ts           # 모든 타입 re-export
│   │   │       ├── entities.ts        # Project, Epic, Task, TestRun 등
│   │   │       ├── inputs.ts          # MCP/REST 입력 타입
│   │   │       └── outputs.ts         # 응답 타입
│   │   ├── tests/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   └── tools/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   └── web-ui/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── TaskList.tsx
│       │   │   ├── TaskDetail.tsx
│       │   │   ├── EpicList.tsx
│       │   │   ├── Activity.tsx
│       │   │   └── TestResults.tsx
│       │   ├── components/
│       │   │   ├── ui/               # shadcn/ui 컴포넌트
│       │   │   ├── ProgressBar.tsx
│       │   │   ├── StatusBadge.tsx
│       │   │   ├── ActivityTimeline.tsx
│       │   │   ├── TestResultCard.tsx
│       │   │   ├── KanbanBoard.tsx
│       │   │   └── ProjectSelector.tsx
│       │   ├── api/
│       │   │   └── client.ts         # fetch wrapper
│       │   ├── hooks/
│       │   │   ├── useProjects.ts
│       │   │   ├── useTasks.ts
│       │   │   └── useDashboard.ts
│       │   └── types/
│       │       └── index.ts          # 프론트엔드 타입 (서버 타입과 공유)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── tailwind.config.ts
│
├── data/                             # .gitignore에 추가
│   └── pm.db
├── .env.example
├── .gitignore
├── .mcp.json                         # Claude Code MCP 설정
├── CLAUDE.md
├── biome.json
├── package.json                      # 루트 (scripts, devDependencies)
├── pnpm-workspace.yaml
└── tsconfig.base.json                # 공유 TS 설정
```

### 11.2 Implementation Order

#### Phase 1: 기반 구축 + MCP 기본 도구 (1주)

1. [ ] 모노레포 초기화 (pnpm workspace, tsconfig, biome)
2. [ ] SQLite 스키마 생성 (db/migrate.ts)
3. [ ] Repository 레이어 구현 (project-repo, epic-repo, task-repo, activity-repo)
4. [ ] Service 레이어 구현 (project-service, task-service)
5. [ ] MCP 서버 보일러플레이트 + task-tools 구현
6. [ ] `.mcp.json` 설정 + Claude Code 연동 테스트

#### Phase 2: 세션 컨텍스트 + 우선순위 (1주)

7. [ ] context-service 구현 (세션 컨텍스트 조합)
8. [ ] context-tools 구현 (get_session_context, get_project_status, get_blocking_analysis)
9. [ ] priority-engine 구현 (의존성 기반 우선순위 계산, 다음 태스크 추천)
10. [ ] CLAUDE.md 작성 (AI 에이전트 가이드)

#### Phase 3: 테스트 + 수정 루프 (1주)

11. [ ] test-repo 구현 (test_runs, fix_attempts)
12. [ ] test-service 구현 (테스트 실행, 결과 기록, 수정 루프)
13. [ ] test-tools 구현 (run_tests, report_test_result, create_fix_task, escalate_to_human)
14. [ ] 에스컬레이션 정책 구현

#### Phase 4: GitHub 연동 (1주)

15. [ ] github-service 구현 (Octokit 래핑)
16. [ ] github-tools 구현 (link_pr_to_task, create_github_issue, sync_commit_progress)
17. [ ] PR 상태 연동 (get_pr_status)

#### Phase 5: Web 대시보드 (1주)

18. [ ] Express REST API 서버 + 라우트 구현
19. [ ] React + Vite 프로젝트 셋업 (shadcn/ui, Tailwind)
20. [ ] Dashboard, TaskList, TaskDetail 페이지 구현
21. [ ] Activity 타임라인, Test Results 페이지 구현
22. [ ] 전체 통합 테스트

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-26 | Initial design based on Plan document | leechanhee |
