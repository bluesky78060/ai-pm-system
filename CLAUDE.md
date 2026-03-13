# AI PM System - Project Rules

## Ticket-First Development (필수)

모든 작업은 **AI PM System MCP**를 통해 티켓 발행 후 진행. 새 프로젝트 생성 금지.

- **프로젝트 코드**: `APS` / **ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`

## 워크플로우 (필수)

1. **CRITICAL: epic_id 필수 확인**
   - `get_project_status`로 프로젝트의 에픽 목록 조회
   - 적절한 에픽 선택 (없으면 "General" 에픽 사용)
   - **절대로 epic_id: null 금지** - 대시보드에 표시되지 않음

2. `create_task`로 티켓 발행
   - **epic_id 필수 파라미터** - 반드시 지정
   - project_id만으로는 불충분 - epic_id 명시 필요
   - 예: `create_task(epic_id="...", title="...", ...)`

3. **플랜 작성 → 메인 오케스트레이터 승인 (CRITICAL - 구현 전 필수)**
   - planner/executor 에이전트로 플랜 작성 (`docs/01-plan/` 저장)
   - **플랜 문서 필수 포함 항목** (agent-team Planner Agent 기준):
     - 기능 명세: `F-001`, 우선순위 `P0(필수)/P1(중요)/P2(선택)`, 엣지케이스
     - 기술 스택, 구현 로드맵 (Phase 1~N), 예외 처리 계획
   - **플랜 완료 후 메인 오케스트레이터(Claude)가 반드시 직접 검토**
   - 검토 기준: ① 목표 명확성 ② 구현 범위 적절성 ③ 리스크 식별 ④ 예상 산출물
   - 승인 시 → 다음 단계 진행
   - 반려 시 → 플랜 수정 요청 후 재검토 (구현 절대 불가), **최대 3회**
   - **승인 없이 start_work 및 코드 작성 시작 금지**

4. **팀 에이전트 태스크 배분 및 병렬 실행 (승인 후 즉시)**
   - 플랜을 기능 단위로 분해 → 팀 에이전트에 병렬 위임
   - **에이전트 유형 × bkit 스킬 매핑 (필수 준수)**:

   | 작업 유형 | 에이전트 | 모델 | bkit 스킬 |
   |-----------|----------|------|-----------|
   | 백엔드 API/로직 | `executor` | sonnet | `/phase-4-api` |
   | 복잡한 백엔드 | `executor-high` | opus | `/phase-4-api` |
   | UI 컴포넌트 | `designer` | sonnet | `/phase-5-design-system` |
   | 복잡한 UI 시스템 | `designer-high` | opus | `/phase-5-design-system` |
   | 간단한 수정 | `executor-low` | haiku | — |
   | 문서 작성 | `writer` | haiku | `/pdca` |
   | 코드 탐색 | `explore-medium` | sonnet | — |
   | 보안 검토 | `security-reviewer` | opus | `/security-review` |
   | 빌드 에러 | `build-fixer` | sonnet | `/build-fix` |

   - **병렬 원칙**: 독립 파일/기능은 동시 실행, 의존성 있는 작업은 순차 실행
   - **파일 충돌 방지**: 동일 파일을 여러 에이전트가 동시 수정 금지
   - 각 에이전트는 자신의 작업 완료 후 결과를 메인 오케스트레이터에 보고

5. `smart_workflow(task_id, 'start_work')` → in_progress (배분과 동시에 실행)

6. 빌드/테스트 실행 후 `smart_workflow(task_id, 'submit_test', test_results=[...])` (build 필수, output 10자+)

7. **code-reviewer 에이전트** (`/code-review` 스킬)로 리뷰 후 `smart_workflow(task_id, 'approve_review', notes='...')` (20자+)
   - **리뷰 notes 필수 형식** (agent-team Reviewer Agent 기준):
     ```
     🔴 CRITICAL: N건 - [내용]
     🟠 MAJOR: N건 - [내용]
     🟡 MINOR: N건 - [내용]
     🔵 SUGGESTION: N건 - [내용]
     → 판정: APPROVED / CHANGES_REQUESTED
     ```
   - CRITICAL/MAJOR 0건 → `approve_review` 진행
   - CRITICAL/MAJOR 1건 이상 → `request_changes` (issues 필드에 수정 요청 내용 작성)
   - **최대 반복 3회**: `request_changes` → 수정 → 리뷰 사이클은 최대 3회까지. 초과 시 사용자에게 보고

8. 자동으로 done 전환

**상세 에이전트/스킬 가이드**: `docs/workflow-guide.md` 참조

## 금지 사항

- **epic_id: null로 티켓 발행 절대 금지** - 대시보드에 표시되지 않음
- 티켓 없이 코드 변경 금지
- `update_task_status`로 testing→review, review→done 직접 전환 금지 (서버 차단됨)
- 빌드 미실행 submit_test / 리뷰 미수행 approve_review 금지
- project_id만 지정하고 epic_id 누락 금지
- **메인 오케스트레이터 플랜 승인 없이 구현(start_work) 시작 금지**

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, PostgreSQL
- **Frontend**: React 19, Vite 6, Tailwind CSS v4
- **Monorepo**: pnpm workspaces (`@ai-pm/mcp-server`, `@ai-pm/web-ui`)
- **Build**: `pnpm -r build` / **Test**: `pnpm --filter @ai-pm/mcp-server test`
