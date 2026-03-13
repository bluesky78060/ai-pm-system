#!/bin/bash
# open-dashboard.sh
# create_task 완료 후 .claude/active-ticket 파일에 티켓 코드 자동 저장

INPUT=$(cat)
TICKET_CODE=$(echo "$INPUT" | jq -r '.tool_response.task.ticket_code // empty' 2>/dev/null)

if [[ -n "$TICKET_CODE" ]]; then
  PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  mkdir -p "$PROJECT_ROOT/.claude"
  echo "$TICKET_CODE" > "$PROJECT_ROOT/.claude/active-ticket"
  echo "🎫 Active ticket set: $TICKET_CODE"
fi

exit 0
