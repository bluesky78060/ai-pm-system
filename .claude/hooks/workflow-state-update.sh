#!/bin/bash
# workflow-state-update.sh — PostToolUse hook for smart_workflow
# smart_workflow 응답에서 task 상태를 추출해 .claude/state/active-workflow에 기록.
# done/blocked 상태면 파일 삭제 → Stop hook이 silent-stop 경고 안 띄움.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "mcp__ai-pm__smart_workflow" && "$TOOL_NAME" != "mcp__ai-pm-system__smart_workflow" ]]; then
  exit 0
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$PROJECT_ROOT" ]]; then
  exit 0
fi

STATE_DIR="$PROJECT_ROOT/.claude/state"
STATE_FILE="$STATE_DIR/active-workflow"

mkdir -p "$STATE_DIR"

# smart_workflow 응답에서 task.status, task.ticket_code 추출
NEW_STATUS=$(echo "$INPUT" | jq -r '.tool_response.task.status // empty')
TICKET_CODE=$(echo "$INPUT" | jq -r '.tool_response.task.ticket_code // empty')

if [[ -z "$NEW_STATUS" || -z "$TICKET_CODE" ]]; then
  # 응답 파싱 실패 — 영향 없이 종료
  exit 0
fi

# ticket_code 형식 검증 (CODE-X-Y 또는 CODE-X 패턴만 허용)
# 파이프/세미콜론 등 주입 방지 + state 파일 필드 구조 보호
if [[ ! "$TICKET_CODE" =~ ^[A-Z][A-Z0-9]+-[0-9]+(-[0-9]+)?$ ]]; then
  exit 0
fi

# status도 허용 enum만 통과
case "$NEW_STATUS" in
  todo|in_progress|testing|review|fixing|done|blocked|cancelled) ;;
  *) exit 0 ;;
esac

# done 또는 blocked 상태면 state 파일 삭제 (워크플로우 완료/대기)
if [[ "$NEW_STATUS" == "done" || "$NEW_STATUS" == "blocked" || "$NEW_STATUS" == "cancelled" ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# in_progress, testing, review, fixing 등 → state 기록
# 형식: <ticket_code>|<status>|<timestamp>
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "${TICKET_CODE}|${NEW_STATUS}|${TIMESTAMP}" > "$STATE_FILE"

exit 0
