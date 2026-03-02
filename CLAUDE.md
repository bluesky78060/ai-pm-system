# AI PM System - Project Rules

## Ticket-First Development (필수)

이 프로젝트에서의 모든 작업은 **AI PM System MCP를 통해 티켓을 발행한 후 진행**해야 합니다.

### 기본 프로젝트

모든 작업은 기존 **AI PM System** 프로젝트 내에서 진행합니다. 새 프로젝트를 만들지 않습니다.

- **프로젝트 코드**: `APS`
- **프로젝트 ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`

### 작업 프로세스 (에이전트 오케스트레이션)

각 상태에서 **실제 에이전트가 해당 작업을 수행**해야 한다. 형식적 전환은 서버에서 차단된다.

1. **에픽 확인/생성**: `get_project_status`로 기존 에픽 목록을 확인. 새로운 기능 영역이면 `create_epic`으로 에픽 추가.
2. **티켓 발행**: `create_task`로 티켓 생성. 반드시 `epic_id` 지정.
3. **작업 시작**: `smart_workflow(task_id, 'start_work')` 호출 → `in_progress` 전환.
   - **여러 태스크를 동시에 `in_progress`로 전환 가능** (병렬 작업 지원)
   - 독립적인 태스크들은 동시에 `start_work` 호출하여 병렬 진행
4. **코드 작성 (in_progress)**: **executor 에이전트**에 위임하여 실제 코드 작성.
   - 복잡한 작업: `executor-high` (Opus)
   - 표준 작업: `executor` (Sonnet)
   - 단순 변경: `executor-low` (Haiku)
   - **하나의 태스크에 여러 에이전트를 병렬 투입 가능** (파일별 분배)

### 병렬 작업 패턴

#### 패턴 1: 다중 태스크 병렬 진행

독립적인 태스크 여러 개를 동시에 `in_progress`로 전환하고 각각에 에이전트를 배정한다.

```
# 여러 태스크를 동시에 시작
smart_workflow(task_A, 'start_work')  # 프론트엔드 작업
smart_workflow(task_B, 'start_work')  # 백엔드 작업
smart_workflow(task_C, 'start_work')  # 문서 작업

# 각 태스크에 적절한 에이전트 배정 (병렬 실행)
Agent(designer, "task_A: UI 컴포넌트 구현")
Agent(executor, "task_B: API 엔드포인트 추가")
Agent(writer, "task_C: API 문서 작성")
```

#### 패턴 2: 단일 태스크에 다중 에이전트 병렬 투입

하나의 태스크를 파일/영역별로 나눠서 여러 에이전트가 동시에 작업한다.

```
# 하나의 태스크에 여러 에이전트를 동시에 투입
smart_workflow(task_id, 'start_work')

# 파일 소유권 분배 (충돌 방지)
Agent(executor, "task: 백엔드 service 수정 - service.ts만 수정")
Agent(designer, "task: 프론트엔드 UI 수정 - Component.tsx만 수정")
Agent(executor-low, "task: 타입 정의 수정 - types.ts만 수정")
```

#### 병렬 작업 규칙

1. **파일 충돌 방지**: 같은 파일을 여러 에이전트가 동시에 수정하지 않는다. 파일별로 소유권을 분배한다.
2. **의존성 확인**: 태스크 간 의존성이 있으면 순차 실행. `get_blocking_analysis`로 확인.
3. **검증은 모든 병렬 작업 완료 후**: 모든 에이전트 작업이 끝난 뒤 한 번에 `submit_test` 호출.
4. **독립적인 태스크만 병렬**: 서로 의존하는 태스크는 순차 진행.

### 작업 프로세스 (계속)

1. **검증 (testing)**: 코드 작성 완료 후 **실제 빌드/테스트 실행**:
   - `pnpm -r build` 실행하여 빌드 결과 수집
   - `pnpm test` 실행하여 테스트 결과 수집 (있는 경우)
   - `smart_workflow(task_id, 'submit_test', test_results=[...])` 호출
   - **test_results에 반드시 build 타입 포함 + 실제 출력(output) 10자 이상 필수**
   - 통과 → 자동으로 `review` 전환 / 실패 → `fixing` 전환
2. **코드 리뷰 (review)**: **code-reviewer 에이전트**에 위임하여 실제 코드 리뷰 수행.
   - 리뷰 결과(발견사항, 승인/거부)를 받아서
   - `smart_workflow(task_id, 'approve_review', notes='리뷰 결과 상세')` 호출
   - **notes 20자 이상 필수 (실제 리뷰 결과)**
3. **완료**: 리뷰 승인 시 자동으로 `done` 전환. 에픽 진행률 + 다음 추천 태스크 반환.

### 티켓코드 형식

```
{PROJECT_CODE}-{EPIC_SEQ}-{TASK_SEQ}
예: TIS-1-3, APS-2-5
```

- 프로젝트 생성 시 이름에서 자동으로 코드 생성 (ASCII 이니셜 기반)
- 에픽과 태스크에 순번 자동 부여
- UUID 또는 티켓코드 모두 사용 가능

### MCP 도구 목록 (주요)

| 도구 | 용도 |
|------|------|
| `create_project` | 프로젝트 생성 |
| `create_epic` | 에픽 생성 |
| `create_task` | 티켓 발행 |
| `smart_workflow` | **워크플로우 전환 (필수 사용)** — start_work, submit_test, complete_fix, approve_review |
| `update_task_status` | 단순 상태 전환 (testing→review, review→done은 차단됨) |
| `get_project_status` | 프로젝트 진행률 조회 |
| `get_session_context` | 현재 작업 컨텍스트 조회 |
| `get_blocking_analysis` | 블로킹 분석 |

### 상태별 에이전트 + 스킬 매핑 (필수)

각 워크플로우 단계에서 작업 복잡도에 따라 적절한 **에이전트**와 **스킬**을 선택한다.

#### in_progress (코드 작성)

| 작업 복잡도 | 에이전트 | 모델 |
|------------|---------|------|
| 단순 변경 (1-2줄, 오타, 설정) | `executor-low` | haiku |
| 기능 구현 (일반적인 기능 추가/수정) | `executor` | sonnet |
| 복잡한 리팩토링 (아키텍처 변경, 다중 파일) | `executor-high` | opus |
| UI 컴포넌트 작업 | `designer` | sonnet |
| 복잡한 UI 시스템 (디자인 시스템, 다중 화면) | `designer-high` | opus |

**활용 가능 스킬:**

| 상황 | 스킬 | 설명 |
|------|-----|------|
| 대규모 기능 자율 구현 | `/autopilot` | 아이디어 → 완성 코드까지 자율 실행 |
| 최대 병렬 실행이 필요할 때 | `/ultrawork` | 여러 에이전트 동시 투입, 최대 속도 |
| 토큰 절약하며 병렬 실행 | `/ecomode` | haiku/sonnet 에이전트 위주 병렬 |
| 5배속 병렬 자율 실행 | `/ultrapilot` | 파일 소유권 분배 + 최대 5개 워커 병렬 |
| 복잡한 작업을 끝까지 완수 | `/ralph` | 완료될 때까지 반복 루프 |
| UI/프론트엔드 작업 | `/frontend-ui-ux` | 디자인 감각 적용 (자동 활성화) |
| 사전 계획이 필요할 때 | `/plan` 또는 `/ralplan` | 구현 전략 수립 후 실행 |
| TDD 방식 개발 | `/tdd` | 테스트 먼저 작성 후 구현 |

#### testing (빌드 + 테스트 실행)

| 상황 | 에이전트 | 모델 |
|------|---------|------|
| 빌드 실패 시 간단한 수정 | `build-fixer-low` | haiku |
| 빌드/타입 에러 해결 | `build-fixer` | sonnet |
| CLI/통합 테스트 실행 | `qa-tester` | sonnet |

**활용 가능 스킬:**

| 상황 | 스킬 | 설명 |
|------|-----|------|
| 빌드 에러 자동 수정 | `/build-fix` | 최소 변경으로 빌드 에러 해결 |
| 테스트/검증 반복 사이클 | `/ultraqa` | 테스트 → 수정 → 재테스트 반복 |

#### review (코드 리뷰)

| 리뷰 범위 | 에이전트 | 모델 |
|----------|---------|------|
| 소규모 변경 빠른 점검 | `code-reviewer-low` | haiku |
| 전체 코드 리뷰 (기본) | `code-reviewer` | opus |
| 보안 취약점 점검 | `security-reviewer` | opus |
| 빠른 보안 스캔 | `security-reviewer-low` | haiku |

**활용 가능 스킬:**

| 상황 | 스킬 | 설명 |
|------|-----|------|
| 종합 코드 리뷰 | `/code-review` | 품질, 보안, 유지보수성 점검 |
| 보안 전문 리뷰 | `/security-review` | OWASP Top 10 취약점 탐지 |
| 코드 간소화 | `/simplify` | 변경된 코드의 재사용성, 품질 검토 |

#### 탐색/분석 (작업 전 컨텍스트 파악)

| 용도 | 에이전트 | 모델 |
|------|---------|------|
| 빠른 파일/코드 검색 | `explore` | haiku |
| 중간 수준 탐색 | `explore-medium` | sonnet |
| 복잡한 아키텍처 분석 | `explore-high` | opus |
| 간단한 디버깅 | `architect-low` | haiku |
| 복잡한 디버깅/아키텍처 결정 | `architect` | opus |
| 외부 문서/API 조사 | `researcher` | sonnet |

**활용 가능 스킬:**

| 상황 | 스킬 | 설명 |
|------|-----|------|
| 코드베이스 깊은 검색 | `/deepsearch` | 키워드/패턴 기반 철저한 탐색 |
| 심층 분석/디버깅 | `/analyze` | 원인 분석, 아키텍처 조사 |
| 병렬 리서치 | `/research` | 여러 scientist 에이전트로 동시 조사 |

#### 고급 오케스트레이션 스킬

| 스킬 | 설명 | 사용 시점 |
|-----|------|----------|
| `/swarm` | N개 에이전트가 공유 태스크 풀에서 작업 | 대량의 독립적 작업 (예: 파일별 수정) |
| `/pipeline` | 에이전트 순차 체이닝 (explore→architect→executor) | 단계별 의존성 있는 작업 |

#### 에이전트 선택 원칙

1. **비용 최적화**: 간단한 작업에 opus를 쓰지 않는다. haiku로 충분한 작업은 haiku를 사용한다.
2. **병렬 활용**: 독립적인 작업은 여러 에이전트를 동시에 실행한다.
3. **단계적 상승**: 먼저 낮은 티어로 시도하고, 실패하면 높은 티어로 에스컬레이션한다.

### 금지 사항

- 티켓 없이 코드 변경 작업을 시작하지 않는다.
- `update_task_status`로 `testing→review`, `review→done` 직접 전환 금지 (서버에서 차단됨).
- 빌드/테스트를 **실제 실행하지 않고** `submit_test` 호출 금지.
- 코드 리뷰를 **실제 수행하지 않고** `approve_review` 호출 금지.
- 상태 머신을 우회하지 않는다 (예: `todo`에서 바로 `done`으로 전환 불가).
- **새 프로젝트를 생성하지 않는다.** 모든 작업은 기존 APS 프로젝트 내에서 에픽/태스크로 관리한다.

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, PostgreSQL (pg)
- **Frontend**: React 19, Vite 6, Tailwind CSS v4
- **Monorepo**: pnpm workspaces (`@ai-pm/mcp-server`, `@ai-pm/web-ui`)
- **MCP**: Model Context Protocol (stdio transport)
- **Build**: `pnpm -r build`
- **Test**: `pnpm --filter @ai-pm/mcp-server test` (vitest)
- **API Server**: `node packages/mcp-server/dist/api-server.js` (port 3001)
