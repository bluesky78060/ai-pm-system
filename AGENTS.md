# AI PM System - Agent Documentation

> **이 문서는 AI 에이전트를 위한 프로젝트 가이드입니다.**
> 컴팩션 후에도 프로젝트 컨텍스트를 유지하기 위해 작성되었습니다.

---

## 프로젝트 개요

- **프로젝트명**: AI PM System
- **프로젝트 코드**: `APS`
- **프로젝트 ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`
- **목적**: AI 에이전트 기반 프로젝트 관리 시스템 (MCP 서버 + 웹 UI)

## 핵심 원칙

### 1. Ticket-First Development (필수)

**모든 작업은 반드시 티켓 발행 후 진행합니다.**

- 티켓 없이 코드 변경 절대 금지
- 새 프로젝트 생성 금지 (APS 프로젝트만 사용)
- 모든 변경사항은 추적 가능해야 함

### 2. 워크플로우 엄격 준수

상태 전환은 **반드시** `smart_workflow` API를 통해서만 가능합니다.

---

## 필수 워크플로우

### Step 1: 티켓 생성

```bash
# 1. 현재 에픽 확인
get_project_status(project_id="9fe805f8-15d6-4d67-804f-b14f57e13616")

# 2. 티켓 생성 (epic_id 필수)
create_task(
  project_id="9fe805f8-15d6-4d67-804f-b14f57e13616",
  title="작업 제목",
  description="작업 설명",
  epic_id="<epic-id>",  # 필수!
  priority="medium"
)
```

### Step 2: 작업 시작

```bash
smart_workflow(task_id="<task-id>", action="start_work")
# → 상태: backlog → in_progress (병렬 전환 가능)
```

### Step 3: 코드 작성 (에이전트 위임)

**직접 코드 작성 금지. 반드시 에이전트에 위임:**

| 복잡도 | 에이전트 | 모델 | 사용 시점 |
|--------|----------|------|-----------|
| 단순 | `executor-low` | haiku | 간단한 수정, 단일 파일 변경 |
| 표준 | `executor` | sonnet | 일반적인 기능 구현 |
| 복잡 | `executor-high` | opus | 아키텍처 변경, 대규모 리팩토링 |

**스킬 활용:**
- `/autopilot`: 완전 자동화 실행
- `/ultrawork`: 병렬 실행 (최대 성능)
- `/ecomode`: 토큰 효율적 병렬 실행

### Step 4: 테스트 제출

```bash
# 1. 빌드 실행 (필수!)
pnpm -r build

# 2. 테스트 제출
smart_workflow(
  task_id="<task-id>",
  action="submit_test",
  test_results=[
    {
      type: "build",           # 필수!
      status: "passed",
      output: "Build succeeded: 0 errors, 0 warnings"  # 10자 이상!
    }
  ]
)
# → 상태: in_progress → testing
```

**필수 조건:**
- `pnpm -r build` 실제 실행 후 결과 포함
- `test_results`에 반드시 `build` 타입 포함
- `output` 필드 10자 이상 실제 출력
- 빌드 실패 시 `build-fixer` 에이전트 사용

### Step 5: 리뷰 승인

```bash
# 1. 코드 리뷰 (필수!)
# - code-reviewer(opus) 에이전트 사용
# - 또는 /code-review 스킬 실행

# 2. 리뷰 승인
smart_workflow(
  task_id="<task-id>",
  action="approve_review",
  notes="리뷰 결과 상세 내용 (20자 이상)"  # 필수!
)
# → 상태: testing → review
```

**필수 조건:**
- `code-reviewer` 에이전트로 실제 리뷰 수행
- `notes` 필드 20자 이상 리뷰 결과 포함

### Step 6: 자동 완료

`approve_review` 성공 시 **자동으로 `done` 상태**로 전환됩니다.

---

## 금지 사항 (서버 차단됨)

### ❌ 직접 상태 전환 금지

```bash
# 절대 사용 금지!
update_task_status(task_id, status="review")  # ❌ 차단됨
update_task_status(task_id, status="done")    # ❌ 차단됨
```

**이유**: `testing → review`, `review → done` 전환은 서버에서 차단됩니다.
**올바른 방법**: `smart_workflow`의 `submit_test`, `approve_review` 사용

### ❌ 검증 생략 금지

```bash
# 빌드 미실행 후 submit_test → ❌ 금지
# 리뷰 미수행 후 approve_review → ❌ 금지
```

### ❌ 티켓 없는 코드 변경

모든 코드 변경은 반드시 티켓과 연결되어야 합니다.

---

## Tech Stack

### Backend
- **언어**: TypeScript
- **런타임**: Node.js
- **프레임워크**: Express
- **데이터베이스**: PostgreSQL
- **빌드**: `pnpm --filter @ai-pm/mcp-server build`
- **테스트**: `pnpm --filter @ai-pm/mcp-server test`

### Frontend
- **프레임워크**: React 19
- **빌드 도구**: Vite 6
- **스타일링**: Tailwind CSS v4
- **빌드**: `pnpm --filter @ai-pm/web-ui build`

### Monorepo
- **도구**: pnpm workspaces
- **전체 빌드**: `pnpm -r build`
- **패키지**:
  - `@ai-pm/mcp-server`: MCP 서버
  - `@ai-pm/web-ui`: 웹 UI

---

## 상세 문서

- **프로젝트 규칙**: `CLAUDE.md`
- **워크플로우 가이드**: `docs/workflow-guide.md`
- **에이전트/스킬 매핑**: `docs/workflow-guide.md` 참조

---

## Hook 시스템

### SessionStart Hook
- **파일**: `.claude/hooks/session-start.sh`
- **목적**: 세션 시작 시 PM 시스템 컨텍스트 자동 로드
- **효과**: 컴팩션 후에도 워크플로우 규칙 유지

### PreToolUse Hooks
- **ticket-guard.sh**: Edit/Write 도구 사용 시 티켓 확인
- **workflow-remind.sh**: smart_workflow 호출 시 규칙 리마인드

---

## 주요 디렉토리

```
ai-pm-system/
├── packages/
│   ├── mcp-server/          # MCP 서버 (백엔드)
│   └── web-ui/              # React 웹 UI (프론트엔드)
├── docs/                    # 문서
│   ├── workflow-guide.md    # 워크플로우 상세 가이드
│   └── ...
├── .claude/                 # Claude Code 설정
│   ├── hooks/               # Hook 스크립트
│   └── settings.local.json  # 로컬 설정
├── CLAUDE.md                # 프로젝트 규칙
└── AGENTS.md                # 이 문서 (AI 가이드)
```

---

## 자주 발생하는 실수

### 1. 티켓 없이 코드 변경
**증상**: PreToolUse hook에서 차단됨
**해결**: `create_task`로 티켓 생성 후 작업

### 2. 직접 상태 전환
**증상**: `update_task_status` 사용 시 서버 에러
**해결**: `smart_workflow` API 사용

### 3. 빌드 없이 submit_test
**증상**: 서버에서 거부됨
**해결**: `pnpm -r build` 실행 후 결과 포함

### 4. 리뷰 없이 approve_review
**증상**: 품질 저하, 버그 증가
**해결**: `code-reviewer` 에이전트로 실제 리뷰 수행

---

## 컴팩션 복구 체크리스트

대화가 컴팩션된 후 다음을 확인하세요:

- [ ] 프로젝트 ID: `9fe805f8-15d6-4d67-804f-b14f57e13616`
- [ ] 티켓 기반 개발 규칙 인지
- [ ] `smart_workflow` 사용 규칙 인지
- [ ] 에이전트 위임 필수 인지
- [ ] 직접 상태 전환 금지 인지

**이 문서(AGENTS.md)와 CLAUDE.md를 참조하면 모든 규칙을 복구할 수 있습니다.**

---

## 마지막 업데이트

- **날짜**: 2026-03-04
- **버전**: 1.0
- **작성자**: AI PM System Team
- **목적**: 컴팩션 후 프로젝트 컨텍스트 보존
