#!/bin/bash
# epic-id-guard.sh — PreToolUse hook for create_task
# epic_id가 null/empty인 티켓 발행을 차단합니다.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "mcp__ai-pm__create_task" && "$TOOL_NAME" != "mcp__ai-pm-system__create_task" ]]; then
  exit 0
fi

EPIC_ID=$(echo "$INPUT" | jq -r '.tool_input.epic_id // empty')

if [[ -z "$EPIC_ID" || "$EPIC_ID" == "null" ]]; then
  cat >&2 <<'BLOCK'
[Epic-ID Guard] epic_id가 누락되었습니다!

CLAUDE.md 규칙: epic_id: null로 티켓 발행 절대 금지 (대시보드 미표시)

해결 방법:
1. mcp__ai-pm__get_project_status로 에픽 목록 조회
2. 적절한 에픽 ID 선택 (없으면 "General" 에픽 사용)
3. create_task(epic_id="<UUID>", title="...", ...) 재호출
BLOCK
  exit 2
fi

exit 0
