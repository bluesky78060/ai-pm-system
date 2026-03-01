#!/bin/bash
# set-ticket.sh - 활성 티켓 설정/해제 헬퍼
# Usage:
#   ./set-ticket.sh APS-3-8    # 티켓 활성화
#   ./set-ticket.sh clear       # 티켓 해제

TICKET_FILE="/Users/leechanhee/ai-pm-system/.claude/active-ticket"

if [[ "$1" == "clear" || "$1" == "" ]]; then
  rm -f "$TICKET_FILE"
  echo "Active ticket cleared."
else
  echo "$1" > "$TICKET_FILE"
  echo "Active ticket set: $1"
fi
