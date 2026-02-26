# AI-Powered Project Management System

> MCP 기반 AI 자율 개발 프로젝트 관리 시스템

| 항목 | 내용 |
|------|------|
| 버전 | v1.0 |
| 작성일 | 2026-02-26 |
| 상태 | 설계 단계 |

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [MCP 도구 명세](#3-mcp-도구-명세)
4. [데이터 모델 (SQLite)](#4-데이터-모델-sqlite)
5. [AI 세션 컨텍스트](#5-ai-세션-컨텍스트-claudemd)
6. [태스크 계층 구조](#6-태스크-계층-구조)
7. [기술 스택](#7-기술-스택)
8. [디렉터리 구조](#8-디렉터리-구조)
9. [태스크 완료 후 테스트 & 수정 플로우](#9-태스크-완료-후-테스트--수정-플로우)
10. [개발 로드맵](#10-개발-로드맵)
11. [미결 사항 & 다음 단계](#11-미결-사항--다음-단계)

---

## 1. 프로젝트 개요

### 1.1 시스템 목적

본 시스템은 AI 에이전트(Claude Code 등)가 개발 프로젝트를 자율적으로 관리할 수 있도록 설계된 MCP(Model Context Protocol) 기반 PM 플랫폼입니다. 사람과 AI가 협력하여 프로젝트의 전체 생명주기를 관리하며, AI가 태스크 생성, 우선순위 조정, 진행 상황 추적, 코드 리뷰까지 자율적으로 수행합니다.

### 1.2 핵심 목표

- AI 에이전트가 MCP 도구를 통해 프로젝트를 자율적으로 관리
- Claude Code 세션 시작 시 즉시 필요한 컨텍스트 제공
- GitHub과 연동하여 실제 개발 흐름과 통합
- 사람의 개입 없이 AI가 스스로 태스크를 분해하고 우선순위 결정
- 로컬 파일(SQLite) 기반으로 별도 서버 없이 즉시 실행 가능

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

| 레이어 | 구성요소 | 역할 |
|--------|---------|------|
| Presentation | Web UI (React + Vite) | 대시보드, 태스크 뷰어 |
| MCP Server | Node.js MCP Tools | AI 에이전트 인터페이스 |
| Business Logic | PM Core Engine | 태스크 관리, 우선순위 계산 |
| Data | SQLite + JSON | 로컬 영구 저장소 |
| Integration | GitHub API + Git | PR, Issue, Commit 연동 |

### 2.2 주요 컴포넌트

#### MCP Server (AI 인터페이스)

Claude Code 및 Cursor 등 AI 에이전트가 MCP 프로토콜을 통해 직접 호출하는 도구 모음입니다. AI는 별도 승인 없이 자율적으로 도구를 실행할 수 있습니다.

#### Web Dashboard (사람 인터페이스)

사람이 전체 프로젝트 현황을 확인하고 필요 시 수동으로 개입할 수 있는 React 기반 웹 UI입니다. AI가 수행한 모든 작업은 이 대시보드에 실시간 반영됩니다.

#### PM Core Engine

태스크 CRUD, 계층 구조 관리, 우선순위 계산, 의존성 분석 등 비즈니스 로직의 핵심을 담당하는 서비스 레이어입니다.

---

## 3. MCP 도구 명세

### 3.1 컨텍스트 도구

| 도구명 | 파라미터 | 반환값 |
|--------|---------|--------|
| `get_session_context` | project_id | 현재 태스크, 진행률, 블로킹 분석, 다음 권장 태스크 |
| `get_project_status` | project_id | 전체 에픽/태스크 진행 현황 대시보드 |
| `get_blocking_analysis` | project_id | 지연/블로킹 태스크 원인 분석 |

### 3.2 태스크 관리 도구

| 도구명 | 파라미터 | 설명 |
|--------|---------|------|
| `create_task` | title, epic_id, description, priority | 태스크 생성 (AI 자율 실행) |
| `decompose_task` | task_id, subtasks[] | 태스크를 서브태스크로 자동 분해 |
| `update_task_status` | task_id, status, notes | 진행 상태 업데이트 |
| `set_priority` | task_id, priority, reason | 우선순위 자율 조정 |
| `add_dependency` | task_id, depends_on_id | 태스크 의존성 설정 |

### 3.3 GitHub 연동 도구

| 도구명 | 파라미터 | 설명 |
|--------|---------|------|
| `link_pr_to_task` | task_id, pr_url | PR과 태스크 연결 |
| `get_pr_status` | task_id | 연결된 PR 상태 조회 |
| `create_github_issue` | task_id | 태스크를 GitHub Issue로 자동 생성 |
| `sync_commit_progress` | task_id, commit_hash | 커밋을 태스크 진행에 반영 |

---

## 4. 데이터 모델 (SQLite)

### 4.1 테이블 구조

#### projects

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,  -- UUID
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active',  -- active | archived
  github_repo TEXT,               -- owner/repo
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### epics

```sql
CREATE TABLE epics (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'todo',  -- todo | in_progress | done
  priority    INTEGER DEFAULT 3,    -- 1(높음) ~ 5(낮음)
  order_index INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### tasks

```sql
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  epic_id       TEXT REFERENCES epics(id),
  parent_id     TEXT REFERENCES tasks(id),  -- 서브태스크
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT DEFAULT 'todo',
  priority      INTEGER DEFAULT 3,
  assignee      TEXT DEFAULT 'ai',  -- ai | human | username
  github_issue  TEXT,
  github_pr     TEXT,
  estimated_hrs REAL,
  actual_hrs    REAL,
  blocked_by    TEXT,  -- 블로킹 이유
  created_by    TEXT DEFAULT 'human',  -- ai | human
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME
);
```

#### task_dependencies

```sql
CREATE TABLE task_dependencies (
  task_id      TEXT REFERENCES tasks(id),
  depends_on   TEXT REFERENCES tasks(id),
  PRIMARY KEY (task_id, depends_on)
);
```

#### activity_log

```sql
CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT REFERENCES tasks(id),
  actor      TEXT NOT NULL,  -- 'ai' | 'human' | 'github'
  action     TEXT NOT NULL,  -- create | update | status_change | comment
  payload    TEXT,           -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. AI 세션 컨텍스트 (CLAUDE.md)

### 5.1 자동 제공 컨텍스트

Claude Code 세션 시작 시 `get_session_context` 도구가 자동으로 호출되어 다음 정보를 제공합니다.

| # | 컨텍스트 항목 | 내용 |
|---|-------------|------|
| 1 | 현재 작업 중인 태스크 | `in_progress` 상태의 태스크 목록 및 상세 |
| 2 | 완료된 태스크 요약 | 최근 완료 태스크와 핵심 결정사항 |
| 3 | 전체 진행률 대시보드 | 프로젝트/에픽별 완료율 및 예상 완료일 |
| 4 | 블로킹 분석 | 지연 태스크의 원인과 해결 방안 제안 |
| 5 | 다음 권장 태스크 | 우선순위 + 의존성 기반 다음 작업 추천 |

### 5.2 CLAUDE.md 템플릿

```markdown
# PM System MCP Guide

## 세션 시작 시 필수 실행
get_session_context(project_id='<PROJECT_ID>')

## 태스크 완료 시
update_task_status(task_id, status='done', notes='완료 내용')
sync_commit_progress(task_id, commit_hash)

## 새 태스크 발견 시 (승인 불필요, 자율 실행)
create_task(title, epic_id, description, priority)

## PR 생성 시
link_pr_to_task(task_id, pr_url)
```

---

## 6. 태스크 계층 구조

### 6.1 계층 모델

| 레벨 | 단위 | 담당 | 예시 |
|------|------|------|------|
| L1 | Project | Human | 농업환경 모니터링 시스템 |
| L2 | Epic | Human / AI | 사용자 인증 모듈 |
| L3 | Task | AI (자율) | JWT 토큰 발급 구현 |
| L4 | Sub-task | AI (자율) | access token 만료 처리 |

### 6.2 태스크 상태 흐름

```
todo  ──►  in_progress  ──►  review  ──►  done
  │                                          ▲
  │              blocked ◄──────────────────┘
  │                │
  └────────────────┘  (블로킹 해제 시 재개)

* AI가 자율적으로 상태 전환 가능
* blocked 상태 시 원인 분석 및 해결 방안 자동 기록
```

---

## 7. 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|---------|
| MCP Server | Node.js + `@modelcontextprotocol/sdk` | Claude Code 공식 지원 |
| Web UI | React + Vite + TypeScript | 빠른 개발, 타입 안전성 |
| UI 컴포넌트 | Tailwind CSS + shadcn/ui | 일관된 디자인 시스템 |
| 데이터베이스 | SQLite (`better-sqlite3`) | 로컬, 서버 불필요 |
| GitHub 연동 | Octokit REST API | PR, Issue, Commit 관리 |
| Git 연동 | simple-git (Node.js) | 로컬 Git 저장소 접근 |
| 패키지 관리 | pnpm workspaces (모노레포) | MCP + Web 통합 관리 |

---

## 8. 디렉터리 구조

```
ai-pm-system/
├── packages/
│   ├── mcp-server/          # MCP 서버
│   │   ├── src/
│   │   │   ├── tools/       # MCP 도구 구현
│   │   │   ├── services/    # PM 비즈니스 로직
│   │   │   └── db/          # SQLite 연결 & 마이그레이션
│   │   └── package.json
│   │
│   └── web-ui/              # React 대시보드
│       ├── src/
│       │   ├── pages/       # Dashboard, Projects, Tasks
│       │   ├── components/  # UI 컴포넌트
│       │   └── api/         # MCP 서버 통신
│       └── package.json
│
├── data/
│   └── pm.db                # SQLite 데이터 파일
│
├── CLAUDE.md                # AI 에이전트 가이드
└── pnpm-workspace.yaml
```

---

## 9. 태스크 완료 후 테스트 & 수정 플로우

### 9.1 개요

태스크가 `in_progress → testing` 상태로 전환되는 순간, AI는 자동으로 테스트를 실행합니다. 테스트 결과에 따라 수정 루프를 자율적으로 반복하며, 최종 통과 시에만 `done` 상태로 전환됩니다.

### 9.2 테스트 & 수정 상태 흐름

```
in_progress
     │
     ▼  (AI: 작업 완료 선언)
  testing          ◄─────────────────────────┐
     │                                        │
     ▼  (AI: 테스트 자동 실행)                │
  ┌──────────────────────────┐                │
  │     테스트 결과 분석      │                │
  └──────────────────────────┘                │
        │                  │                  │
     PASS ✅            FAIL ❌               │
        │                  │                  │
        ▼                  ▼                  │
     review          fixing (수정 중) ────────┘
        │            (최대 3회 자동 재시도)
        ▼  (AI: PR 생성)
      done

* 3회 재시도 후에도 실패 시 → blocked (사람에게 에스컬레이션)
```

### 9.3 테스트 종류 및 실행 시점

| 테스트 종류 | 실행 도구 | 실행 시점 | 실패 시 행동 |
|-----------|---------|---------|------------|
| 단위 테스트 | jest / vitest | `testing` 진입 즉시 | 수정 후 재실행 (자율) |
| 타입 체크 | `tsc --noEmit` | `testing` 진입 즉시 | 타입 오류 자율 수정 |
| 린트 검사 | eslint / biome | `testing` 진입 즉시 | 자동 수정 적용 |
| 통합 테스트 | playwright / supertest | `review` 진입 전 | 블로킹 이슈 분석 후 수정 |
| 빌드 검증 | `pnpm build` | PR 생성 전 | 빌드 실패 시 수정 루프 재진입 |

### 9.4 MCP 테스트 도구 명세

| 도구명 | 파라미터 | 설명 |
|--------|---------|------|
| `run_tests` | task_id, test_types[] | 지정 테스트 실행 후 결과 반환 |
| `report_test_result` | task_id, result, failures[] | 테스트 결과 기록 및 상태 전환 |
| `create_fix_task` | parent_task_id, issue_description | 수정 서브태스크 자동 생성 |
| `get_fix_history` | task_id | 해당 태스크의 수정 이력 조회 |
| `escalate_to_human` | task_id, reason, attempts | 3회 실패 시 사람에게 에스컬레이션 |

### 9.5 테스트 & 수정 데이터 모델

#### test_runs

```sql
CREATE TABLE test_runs (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  run_number   INTEGER NOT NULL,  -- 1, 2, 3 (재시도 횟수)
  test_type    TEXT NOT NULL,     -- unit | type | lint | integration | build
  status       TEXT NOT NULL,     -- pass | fail | skip
  output       TEXT,              -- 테스트 출력 전문
  failures     TEXT,              -- JSON: [{file, line, message}]
  duration_ms  INTEGER,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### fix_attempts

```sql
CREATE TABLE fix_attempts (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id),
  attempt_number  INTEGER NOT NULL,  -- 최대 3
  trigger_run_id  TEXT REFERENCES test_runs(id),
  files_changed   TEXT,   -- JSON: [{ path, diff }]
  fix_description TEXT,   -- AI가 수행한 수정 내용 요약
  result_status   TEXT,   -- pass | fail | escalated
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 9.6 AI 자율 수정 루프 동작 예시

```js
// 1. 태스크 완료 선언 → testing 상태 진입
update_task_status('task_001', 'testing', 'JWT 구현 완료')

// 2. 테스트 실행
run_tests('task_001', ['unit', 'type', 'lint'])
// → { pass: 2, fail: 1, failures: [{file: 'auth.ts', line: 42, msg: 'type error'}] }

// 3. 실패 기록 및 수정 서브태스크 자동 생성
report_test_result('task_001', 'fail', failures)
create_fix_task('task_001', 'auth.ts:42 타입 오류 수정')

// 4. 수정 후 재테스트 (자율 반복)
run_tests('task_001', ['unit', 'type', 'lint'])
// → { pass: 3, fail: 0 }

// 5. 전체 통과 → review 상태로 전환
report_test_result('task_001', 'pass', [])
update_task_status('task_001', 'review', '모든 테스트 통과')

// 6. PR 생성 → done
link_pr_to_task('task_001', 'https://github.com/...')
```

### 9.7 에스컬레이션 정책

AI가 동일 태스크에서 3회 수정을 시도해도 테스트를 통과하지 못한 경우, 자동으로 사람에게 에스컬레이션합니다.

| 조건 | AI 자율 처리 | 에스컬레이션 (사람 개입) |
|------|------------|----------------------|
| 1~3회 실패 | 수정 후 자동 재테스트 반복 | - |
| 3회 초과 실패 | - | `blocked` 상태 전환 + 사람에게 알림 |
| 빌드 오류 | 의존성/설정 문제 자율 분석 후 수정 | 환경 문제 감지 시 에스컬레이션 |
| 테스트 파일 없음 | 기본 테스트 파일 자동 생성 | - |

---

## 10. 개발 로드맵

| 단계 | 기간 | 내용 | 완료 기준 |
|------|------|------|---------|
| Phase 1 | 1주 | SQLite 스키마, MCP 기본 도구 (get/create/update) | AI가 태스크 CRUD 가능 |
| Phase 2 | 1주 | 세션 컨텍스트, 블로킹 분석, 우선순위 엔진 | Claude Code 연동 완료 |
| Phase 3 | 1주 | 테스트 실행 도구, 수정 루프, 에스컬레이션 정책 | AI 자율 테스트 & 수정 동작 |
| Phase 4 | 1주 | GitHub API 연동, PR/Issue 자동 연결 | PR 생성 시 태스크 자동 업데이트 |
| Phase 5 | 1주 | React 대시보드, 실시간 진행률, 테스트 결과 뷰 | 사람이 전체 현황 및 수정 이력 확인 |

---

## 11. 미결 사항 & 다음 단계

### 결정이 필요한 항목

- Web UI와 MCP 서버 간 통신 방식: REST API vs WebSocket (실시간 업데이트 여부)
- 다중 프로젝트 지원 여부: 단일 프로젝트 vs 멀티 프로젝트 관리
- AI 활동 로그의 보존 기간 및 용량 관리 정책
- GitHub 연동 시 인증 방식: Personal Access Token vs GitHub App
- Web UI 인증: 로컬 전용(인증 불필요) vs 기본 인증 추가

### 다음 단계

- Phase 1 개발 시작: SQLite 스키마 생성 및 MCP 서버 보일러플레이트
- CLAUDE.md 초안 작성으로 AI 에이전트 동작 방식 검증
- 미결 사항 결정 후 상세 기술 스펙 문서 작성
