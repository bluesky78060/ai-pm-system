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

3. `smart_workflow(task_id, 'start_work')` → in_progress (병렬 전환 가능)

4. **에이전트에 위임하여 코드 작성** (executor/designer 등, 복잡도에 따라 선택)

5. 빌드/테스트 실행 후 `smart_workflow(task_id, 'submit_test', test_results=[...])` (build 필수, output 10자+)

6. **code-reviewer 에이전트**로 리뷰 후 `smart_workflow(task_id, 'approve_review', notes='...')` (20자+)

7. 자동으로 done 전환

**상세 에이전트/스킬 가이드**: `docs/workflow-guide.md` 참조

## 금지 사항

- **epic_id: null로 티켓 발행 절대 금지** - 대시보드에 표시되지 않음
- 티켓 없이 코드 변경 금지
- `update_task_status`로 testing→review, review→done 직접 전환 금지 (서버 차단됨)
- 빌드 미실행 submit_test / 리뷰 미수행 approve_review 금지
- project_id만 지정하고 epic_id 누락 금지

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, PostgreSQL
- **Frontend**: React 19, Vite 6, Tailwind CSS v4
- **Monorepo**: pnpm workspaces (`@ai-pm/mcp-server`, `@ai-pm/web-ui`)
- **Build**: `pnpm -r build` / **Test**: `pnpm --filter @ai-pm/mcp-server test`
