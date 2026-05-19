#!/bin/bash
# plan-review-guard.sh — PreToolUse hook for smart_workflow start_work
# start_work 호출 시 Discovery + Plan + Plan Review 산출물 모두 존재 확인.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "mcp__ai-pm__smart_workflow" && "$TOOL_NAME" != "mcp__ai-pm-system__smart_workflow" ]]; then
  exit 0
fi

ACTION=$(echo "$INPUT" | jq -r '.tool_input.action // empty')

if [[ "$ACTION" != "start_work" ]]; then
  exit 0
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$PROJECT_ROOT" ]]; then
  exit 0
fi

TASK_ID=$(echo "$INPUT" | jq -r '.tool_input.task_id // empty')
TICKET_FILE="$PROJECT_ROOT/.claude/active-ticket"
TICKET=""
if [[ -f "$TICKET_FILE" ]]; then
  TICKET=$(cat "$TICKET_FILE" | tr -d '[:space:]')
fi

# === APS-1-4: Fast-track 모드 우회 ===
# .claude/active-ticket-fasttrack 파일이 존재하고 active-ticket과 일치하면
# 산출물 검증 우회. 1중 분류 단순 변경에 적용.
FASTTRACK_FILE="$PROJECT_ROOT/.claude/active-ticket-fasttrack"
if [[ -f "$FASTTRACK_FILE" ]]; then
  FT_TICKET=$(cat "$FASTTRACK_FILE" | tr -d '[:space:]')
  if [[ -n "$FT_TICKET" && "$FT_TICKET" == "$TICKET" ]]; then
    echo "[Plan-Review Guard] fast-track 모드 활성 — 산출물 검증 우회 ($TICKET)" >&2
    echo "  주의: fast-track은 1중 분류 단순 변경에만 사용. 보안/결제/DB는 정식 워크플로우 의무." >&2
    exit 0
  fi
fi

DISCOVERY_DIR="$PROJECT_ROOT/docs/00-discovery"
PLAN_DIR="$PROJECT_ROOT/docs/01-plan"
REVIEW_DIR="$PROJECT_ROOT/docs/02-review"

MISSING=()

if [[ ! -d "$DISCOVERY_DIR" ]] || [[ -z "$(ls -A "$DISCOVERY_DIR" 2>/dev/null)" ]]; then
  MISSING+=("docs/00-discovery/ (Discovery Q&A 산출물)")
fi

if [[ ! -d "$PLAN_DIR" ]] || [[ -z "$(ls -A "$PLAN_DIR" 2>/dev/null)" ]]; then
  MISSING+=("docs/01-plan/ (플랜 문서)")
fi

if [[ ! -d "$REVIEW_DIR" ]] || [[ -z "$(ls -A "$REVIEW_DIR" 2>/dev/null)" ]]; then
  MISSING+=("docs/02-review/ (플랜 리뷰 산출물)")
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "[Plan-Review Guard] start_work 차단 - 선결 산출물 누락:" >&2
  for item in "${MISSING[@]}"; do
    echo "  - $item" >&2
  done
  cat >&2 <<'BLOCK'

CLAUDE.md 규칙 (워크플로우 3→4→5단계):
1. Discovery Q&A → docs/00-discovery/
2. 플랜 작성 → docs/01-plan/
3. 플랜 리뷰 (critic + 오케스트레이터) → docs/02-review/
4. 위 모두 통과 후에만 start_work 가능

플랜 리뷰 단계는 반드시 critic 에이전트(Opus) 또는 /oh-my-claudecode:review 스킬로
독립 리뷰를 진행한 후 docs/02-review/ 에 결과를 저장해야 합니다.
BLOCK
  exit 2
fi

# 활성 티켓이 있다면 해당 티켓 산출물 매칭 검증
if [[ -n "$TICKET" ]]; then
  TICKET_MISSING=()
  if ! ls "$DISCOVERY_DIR" 2>/dev/null | grep -q "$TICKET"; then
    TICKET_MISSING+=("docs/00-discovery/${TICKET}-* (.md 또는 .html)")
  fi
  if ! ls "$PLAN_DIR" 2>/dev/null | grep -q "$TICKET"; then
    TICKET_MISSING+=("docs/01-plan/${TICKET}-* (.md 또는 .html)")
  fi
  if ! ls "$REVIEW_DIR" 2>/dev/null | grep -q "$TICKET"; then
    TICKET_MISSING+=("docs/02-review/${TICKET}-plan-review.* (.md 또는 .html)")
  fi
  if [[ ${#TICKET_MISSING[@]} -gt 0 ]]; then
    echo "[Plan-Review Guard] 활성 티켓 ($TICKET)에 대한 산출물 누락:" >&2
    for item in "${TICKET_MISSING[@]}"; do
      echo "  - $item" >&2
    done
    exit 2
  fi
fi

exit 0
