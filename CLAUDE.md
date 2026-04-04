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

4. 플랜을 기능 단위로 분해 → 팀 에이전트에 병렬 위임 (에이전트 매핑: `.claude/rules/agent-mapping.md`)

5. `smart_workflow` 워크플로우 단계 실행 (상세: `.claude/rules/workflow-steps.md`)

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
