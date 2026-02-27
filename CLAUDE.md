# AI PM System - Project Rules

## Ticket-First Development (필수)

이 프로젝트에서의 모든 작업은 **AI PM System MCP를 통해 티켓을 발행한 후 진행**해야 합니다.

### 기본 프로젝트

모든 작업은 기존 **AI PM System** 프로젝트 내에서 진행합니다. 새 프로젝트를 만들지 않습니다.

- **프로젝트 코드**: `APS`
- **프로젝트 ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`

### 작업 프로세스

1. **에픽 확인/생성**: `get_project_status`로 기존 에픽 목록을 확인. 새로운 기능 영역이면 `create_epic`으로 APS 프로젝트에 에픽 추가. 기존 에픽에 해당하면 해당 에픽 사용.
2. **티켓(태스크) 발행**: `create_task` 도구로 티켓 생성. 반드시 `epic_id`를 지정하여 티켓코드(예: `APS-1-3`)가 자동 생성되도록 한다.
3. **상태 전환**: 작업 시작 시 `update_task_status`로 `in_progress`로 전환. 이후 상태 머신에 따라 전환:
   - `todo` → `in_progress` → `testing` → `review` → `done`
   - 문제 발생 시: `testing` → `fixing` → `testing` (반복)
   - 블로커: 어디서든 `blocked` 전환 가능
4. **Verifying 단계**: `testing` 상태에서 실제로 빌드/테스트를 실행하고 결과를 확인한다. 형식적으로 통과시키지 않는다.
5. **Review 단계**: `review` 상태에서 코드 리뷰를 수행한다. 이슈가 발견되면 `in_progress`로 되돌려 수정한다.
6. **완료 보고**: `done` 전환 시 `notes`에 완료 내역을 기록한다.

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
| `update_task_status` | 상태 전환 (반드시 상태 머신 준수) |
| `get_project_status` | 프로젝트 진행률 조회 |
| `get_session_context` | 현재 작업 컨텍스트 조회 |
| `get_blocking_analysis` | 블로킹 분석 |

### 금지 사항

- 티켓 없이 코드 변경 작업을 시작하지 않는다.
- `testing` → `review` → `done` 을 실제 검증 없이 형식적으로 통과시키지 않는다.
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
