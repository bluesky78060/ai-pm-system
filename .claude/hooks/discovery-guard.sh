#!/bin/bash
# discovery-guard.sh — PreToolUse hook for plan creation
# docs/01-plan/ 파일 작성 시 docs/00-discovery/ 산출물 존재를 확인합니다.

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# docs/01-plan/ 경로만 체크
if [[ "$FILE_PATH" != *"/docs/01-plan/"* ]]; then
  exit 0
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$PROJECT_ROOT" ]]; then
  exit 0
fi

DISCOVERY_DIR="$PROJECT_ROOT/docs/00-discovery"

if [[ ! -d "$DISCOVERY_DIR" ]] || [[ -z "$(ls -A "$DISCOVERY_DIR" 2>/dev/null)" ]]; then
  cat >&2 <<'BLOCK'
[Discovery Guard] Discovery 산출물 없이 플랜 작성을 시도했습니다!

CLAUDE.md 규칙 (워크플로우 3→4단계):
- 플랜 작성 전 반드시 Discovery Q&A를 진행해야 합니다.
- 산출물: docs/00-discovery/{ticket-id}-direction.md

해결 방법:
1. analyst 에이전트(Opus, READ-ONLY) 호출하여 Q&A 진행
2. 7개 카테고리 답변 확보:
   목표(Why) / 사용자(Who) / 범위(What) / 제약 / 우선순위 / 리스크 / 검증
3. docs/00-discovery/{ticket-id}-direction.md 생성
4. 사용자의 "방향 확정" 명시적 승인 후 플랜 작성 시작
BLOCK
  exit 2
fi

# Discovery는 있으나 현재 티켓에 해당하는 파일이 있는지 확인
TICKET_FILE="$PROJECT_ROOT/.claude/active-ticket"
if [[ -f "$TICKET_FILE" ]]; then
  TICKET=$(cat "$TICKET_FILE" | tr -d '[:space:]')
  if [[ -n "$TICKET" ]]; then
    if ! ls "$DISCOVERY_DIR" 2>/dev/null | grep -q "$TICKET"; then
      cat >&2 <<EOF
[Discovery Guard] 활성 티켓 ($TICKET)에 대한 Discovery 산출물이 없습니다!

기대 파일: docs/00-discovery/${TICKET}-direction.* (.md 또는 .html)

먼저 해당 티켓에 대한 Discovery Q&A를 완료하세요.
EOF
      exit 2
    fi
  fi
fi

exit 0
