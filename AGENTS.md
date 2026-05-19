# AI PM System - Agent Documentation

> **이 문서는 AI 에이전트를 위한 프로젝트 가이드입니다.**
> 컴팩션 후에도 프로젝트 컨텍스트를 유지하기 위해 작성되었습니다.

---

## 프로젝트 개요

- **프로젝트명**: AI PM System
- **프로젝트 코드**: `APS`
- **프로젝트 ID**: `3bc28444-2e96-4587-be23-4c48e220aa66`
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
get_project_status(project_id="3bc28444-2e96-4587-be23-4c48e220aa66")

# 2. 티켓 생성 (epic_id 필수)
create_task(
  project_id="3bc28444-2e96-4587-be23-4c48e220aa66",
  title="작업 제목",
  description="작업 설명",
  epic_id="<epic-id>",  # 필수!
  priority="medium"
)
```

### Step 2: 플랜 작성 및 메인 오케스트레이터 승인 (CRITICAL)

```bash
# 1. planner/executor 에이전트로 플랜 작성
Task(subagent_type="oh-my-claudecode:executor",
     prompt="/pdca plan <기능명> → docs/01-plan/ 저장")

# 2. 메인 오케스트레이터(Claude)가 플랜 직접 검토
Read("docs/01-plan/<기능명>.plan.md")

# 3. 플랜 문서 필수 포함 항목 (agent-team Planner Agent 기준)
# ┌─ 기능 명세: F-001 형식, 우선순위 P0(필수)/P1(중요)/P2(선택)
# ├─ 엣지케이스 및 예외 처리 계획
# ├─ 기술 스택, 외부 의존성
# └─ 구현 로드맵 (Phase 1: Foundation → Phase N: Finalization)

# 4. 승인 기준 체크 (모두 충족해야 승인)
# ① 목표가 명확하고 측정 가능한가?
# ② 구현 범위가 적절한가? (너무 넓거나 좁지 않은가?)
# ③ 리스크가 식별되었는가?
# ④ 예상 산출물이 명확한가?

# 5. 승인 시 → start_work 진행
# 5. 반려 시 → 플랜 수정 요청, 재검토 (최대 3회, 초과 시 사용자 보고)
```

**⛔ 승인 없이 start_work 및 코드 작성 절대 금지**

### Step 3: 작업 시작 (플랜 승인 후에만)

```bash
smart_workflow(task_id="<task-id>", action="start_work")
# → 상태: backlog → in_progress (병렬 전환 가능)
```

### Step 4: 팀 에이전트 태스크 배분 및 병렬 실행

**직접 코드 작성 금지. 플랜 승인 후 즉시 팀 에이전트에 분배:**

#### 에이전트 × bkit 스킬 매핑 (필수)

| 작업 유형 | 에이전트 | 모델 | bkit 스킬 | 용도 |
|-----------|----------|------|-----------|------|
| 백엔드 API/로직 | `executor` | sonnet | `/phase-4-api` | MCP 서버 도구, 서비스 로직 |
| 복잡한 백엔드 | `executor-high` | opus | `/phase-4-api` | 아키텍처 변경, 대규모 리팩토링 |
| UI 컴포넌트 | `designer` | sonnet | `/phase-5-design-system` | React 컴포넌트, 스타일링 |
| 복잡한 UI 시스템 | `designer-high` | opus | `/phase-5-design-system` | 디자인 시스템 재설계 |
| 간단한 수정 | `executor-low` | haiku | — | 단일 파일, 1-5줄 변경 |
| 문서 작성 | `writer` | haiku | `/pdca` | PDCA 문서, API 명세 |
| 코드 탐색/분석 | `explore-medium` | sonnet | — | 코드 구조 파악 |
| 보안 검토 | `security-reviewer` | opus | `/security-review` | 취약점 분석 |
| 빌드 에러 수정 | `build-fixer` | sonnet | `/build-fix` | 타입/빌드 오류 |
| 코드 리뷰 | `code-reviewer` | opus | `/code-review` | 최종 품질 검토 |

#### 배분 패턴 예시

```
플랜 승인됨: "검색 기능 + UI 구현"
    ↓
메인 오케스트레이터 분해:
  ┌─────────────────────────────────────────┐
  │ [병렬 실행]                              │
  │  Agent A: executor(sonnet)              │
  │    → /phase-4-api 참조                  │
  │    → packages/mcp-server/src/ 담당      │
  │                                         │
  │  Agent B: designer(sonnet)              │
  │    → /phase-5-design-system 참조        │
  │    → packages/web-ui/src/ 담당          │
  └─────────────────────────────────────────┘
    ↓ 모두 완료 후
  Agent C: code-reviewer(opus)
    → /code-review 스킬
    → 전체 변경사항 검토
```

#### 병렬 실행 규칙
- **독립 파일**: 동시 실행 가능 (`mcp-server/` vs `web-ui/` 등)
- **의존성 있는 작업**: 순차 실행 (API 완료 후 UI 연동)
- **동일 파일**: 절대 동시 수정 금지 → 순차 처리

**스킬 활용:**
- `/autopilot`: 완전 자동화 실행
- `/ultrawork`: 최대 병렬 실행
- `/ecomode`: 토큰 효율적 병렬 실행

### Step 5: 테스트 제출

```bash
# 1. 빌드 실행 (필수!)
pnpm -r build

# 2. 테스트 제출
smart_workflow(
  task_id="<task-id>",
  action="submit_test",
  test_results=[
    {
      test_type: "build",      # 필수!
      status: "pass",
      output: "packages/mcp-server build: Done\npackages/web-ui build: ✓ built in 1.06s"  # 10자 이상!
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

### Step 6: 리뷰 승인

```bash
# 1. 코드 리뷰 (필수!)
# - code-reviewer(opus) 에이전트 사용
# - 또는 /code-review 스킬 실행

# 2. 리뷰 결과 심각도 분류 (agent-team Reviewer Agent 기준)
# 🔴 CRITICAL: 보안 취약점, 데이터 손실, 기능 미동작 → 반드시 수정
# 🟠 MAJOR:    설계 미준수, 성능 이슈, 중대한 품질 문제 → 반드시 수정
# 🟡 MINOR:    네이밍, 스타일, 사소한 구조 개선 → 수정 권장
# 🔵 SUGGESTION: 더 나은 방법 제안 → 선택적 반영

# 3a. CRITICAL/MAJOR 0건 → 승인
smart_workflow(
  task_id="<task-id>",
  action="approve_review",
  notes="🔴 CRITICAL: 0건\n🟠 MAJOR: 0건\n🟡 MINOR: N건 - [내용]\n→ 판정: APPROVED"
)

# 3b. CRITICAL/MAJOR 1건 이상 → 수정 요청 (최대 3회)
smart_workflow(
  task_id="<task-id>",
  action="request_changes",
  issues="🔴 CRITICAL: [문제 설명 및 수정 방향]\n🟠 MAJOR: [문제 설명]"
)
# → 상태: review → in_progress (Coder가 수정 후 재빌드 → 재리뷰)
# ⚠️ 최대 3회 반복 허용. 초과 시 사용자에게 상황 보고
```

**필수 조건:**
- `code-reviewer` 에이전트로 실제 리뷰 수행
- `notes` 필드에 심각도 분류 형식 포함 (20자 이상)
- CRITICAL/MAJOR 있으면 `approve_review` 금지 → `request_changes` 사용
- 리뷰 반복은 **최대 3회**까지

### Step 7: 자동 완료

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
- **bkit 통합 계획**: `docs/01-plan/bkit-integration-plan.md`
- **bkit 통합 설계**: `docs/02-design/bkit-integration-design.md`
- **bkit 갭 분석**: `docs/03-analysis/bkit-gap-analysis.md`
- **Zero Script QA 설계**: `docs/02-design/zero-script-qa-design.md`
- **test_results 표준**: `docs/02-design/test-results-standard.md`
- **웹 UI 디자인 시스템**: `docs/02-design/web-ui-design-system.md`
- **MCP API 설계**: `docs/02-design/mcp-api-design.md`

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

## Zero Script QA 가이드라인 (bkit)

bkit의 Zero Script QA 방법론을 AI PM System 빌드/테스트 단계에 적용합니다.

### 표준 절차

```bash
# Step 1: 빌드 실행
pnpm -r build 2>&1

# Step 2: 출력을 test_results로 변환
# 성공 시:
test_results = [
  {
    "test_type": "build",
    "status": "pass",
    "output": "packages/mcp-server build: Done\npackages/web-ui build: ✓ built in 1.06s",
    "duration_ms": 5000
  }
]

# Step 3: submit_test 호출
smart_workflow(task_id="APS-X-Y", action="submit_test", test_results=[...])
```

### 모니터링 포인트

| 체크 항목 | 명령 | 성공 기준 |
|-----------|------|-----------|
| TypeScript 컴파일 | `pnpm -r build` | `Done` 출력 |
| Vite 빌드 | `pnpm -r build` | `✓ built in Xs` |
| 단위 테스트 | `pnpm --filter @ai-pm/mcp-server test` | 모든 테스트 pass |
| 타입 체크 | `tsc --noEmit` | 0 errors |

### 실패 시 대응

빌드 실패 → `build-fixer(sonnet)` 에이전트 투입 또는 `/oh-my-claudecode:build-fix` 스킬 사용

**상세 명세**: `docs/02-design/zero-script-qa-design.md`, `docs/02-design/test-results-standard.md`

---

## 컴팩션 복구 체크리스트

대화가 컴팩션된 후 다음을 확인하세요:

- [ ] 프로젝트 ID: `3bc28444-2e96-4587-be23-4c48e220aa66`
- [ ] 티켓 기반 개발 규칙 인지
- [ ] `smart_workflow` 사용 규칙 인지
- [ ] 에이전트 위임 필수 인지
- [ ] 직접 상태 전환 금지 인지

**이 문서(AGENTS.md)와 CLAUDE.md를 참조하면 모든 규칙을 복구할 수 있습니다.**

---

## 마지막 업데이트

- **날짜**: 2026-03-12
- **버전**: 1.1
- **작성자**: AI PM System Team
- **목적**: 컴팩션 후 프로젝트 컨텍스트 보존 + bkit 통합 가이드라인 추가
