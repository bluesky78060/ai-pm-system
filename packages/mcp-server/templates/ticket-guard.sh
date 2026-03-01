#!/bin/bash
# ticket-guard.sh — PreToolUse hook for Ticket-First Development
# Edit/Write 도구로 소스 코드 수정 시 활성 티켓 존재 여부를 확인합니다.
#
# 설치 방법:
#   1. 이 파일을 프로젝트의 .claude/hooks/ticket-guard.sh 로 복사
#   2. chmod +x .claude/hooks/ticket-guard.sh
#   3. .claude/settings.local.json 에 hook 등록 (아래 참고)
#
# settings.local.json 예시:
#   {
#     "hooks": {
#       "PreToolUse": [{
#         "matcher": "Edit|Write",
#         "hooks": [{
#           "type": "command",
#           "command": ".claude/hooks/ticket-guard.sh"
#         }]
#       }]
#     }
#   }

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# 소스 코드 파일만 체크
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.rs|*.java|*.c|*.cpp|*.h|*.svelte|*.vue|*.css|*.scss|*.swift|*.kt|*.rb|*.php)
    ;;
  *)
    exit 0
    ;;
esac

# .claude/ 내부 파일은 제외
if [[ "$FILE_PATH" == *"/.claude/"* ]]; then
  exit 0
fi

# 프로젝트 루트 감지 (git root 또는 FILE_PATH 기준)
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT=$(dirname "$FILE_PATH")
  while [[ "$PROJECT_ROOT" != "/" && ! -f "$PROJECT_ROOT/CLAUDE.md" ]]; do
    PROJECT_ROOT=$(dirname "$PROJECT_ROOT")
  done
fi

TICKET_FILE="$PROJECT_ROOT/.claude/active-ticket"

if [[ -f "$TICKET_FILE" ]]; then
  TICKET=$(cat "$TICKET_FILE" | tr -d '[:space:]')
  if [[ -n "$TICKET" ]]; then
    echo "{\"additionalContext\": \"[Active Ticket: $TICKET]\"}"
    exit 0
  fi
fi

cat >&2 <<'WARN'
[Ticket-First Rule] 활성 티켓 없이 소스 코드를 수정하려고 합니다!

먼저 티켓을 발행하세요:
1. get_project_status → 에픽 확인
2. create_task → 티켓 생성
3. echo "TICKET_CODE" > .claude/active-ticket
4. 그 후 코드 수정 진행
WARN
exit 2
