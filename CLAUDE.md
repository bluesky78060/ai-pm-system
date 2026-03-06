# AI PM System - Project Rules

## Ticket-First Development (필수)

모든 작업은 **AI PM System MCP**를 통해 티켓 발행 후 진행. 새 프로젝트 생성 금지.

- **프로젝트 코드**: `APS` / **ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`

## 워크플로우 (필수)

1. `get_project_status`로 에픽 확인 → `create_task`로 티켓 발행 (epic_id 필수)
2. `smart_workflow(task_id, 'start_work')` → in_progress (병렬 전환 가능)
3. **에이전트에 위임하여 코드 작성** (executor/designer 등, 복잡도에 따라 선택)
4. 빌드/테스트 실행 후 `smart_workflow(task_id, 'submit_test', test_results=[...])` (build 필수, output 10자+)
5. **code-reviewer 에이전트**로 리뷰 후 `smart_workflow(task_id, 'approve_review', notes='...')` (20자+)
6. 자동으로 done 전환

**상세 에이전트/스킬 가이드**: `docs/workflow-guide.md` 참조

## 금지 사항

- 티켓 없이 코드 변경 금지
- `update_task_status`로 testing→review, review→done 직접 전환 금지 (서버 차단됨)
- 빌드 미실행 submit_test / 리뷰 미수행 approve_review 금지

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, PostgreSQL
- **Frontend**: React 19, Vite 6, Tailwind CSS v4
- **Monorepo**: pnpm workspaces (`@ai-pm/mcp-server`, `@ai-pm/web-ui`)
- **Build**: `pnpm -r build` / **Test**: `pnpm --filter @ai-pm/mcp-server test`
