#!/bin/bash
# codex-review-guard.sh — PreToolUse hook for smart_workflow approve_review
# approve_review 호출 시 코드 리뷰 산출물(docs/03-code-review/) 존재 및
# 중요 변경의 경우 codex review/challenge 흔적을 검증합니다.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "mcp__ai-pm__smart_workflow" && "$TOOL_NAME" != "mcp__ai-pm-system__smart_workflow" ]]; then
  exit 0
fi

ACTION=$(echo "$INPUT" | jq -r '.tool_input.action // empty')

if [[ "$ACTION" != "approve_review" ]]; then
  exit 0
fi

NOTES=$(echo "$INPUT" | jq -r '.tool_input.notes // empty')
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [[ -z "$PROJECT_ROOT" ]]; then
  exit 0
fi

REVIEW_DIR="$PROJECT_ROOT/docs/03-code-review"
TICKET_FILE="$PROJECT_ROOT/.claude/active-ticket"
TICKET=""
if [[ -f "$TICKET_FILE" ]]; then
  TICKET=$(cat "$TICKET_FILE" | tr -d '[:space:]')
fi

# 1. 코드 리뷰 산출물 존재 확인
if [[ ! -d "$REVIEW_DIR" ]] || [[ -z "$(ls -A "$REVIEW_DIR" 2>/dev/null)" ]]; then
  cat >&2 <<'BLOCK'
[Code-Review Guard] approve_review 차단 - 리뷰 산출물 누락!

CLAUDE.md 규칙: docs/03-code-review/{task-id}-review.md 필수
- code-reviewer 에이전트 또는 /code-review 스킬 실행
- 결과를 docs/03-code-review/ 에 저장 후 approve_review 호출
BLOCK
  exit 2
fi

# 2. 활성 티켓의 리뷰 파일 매칭
if [[ -n "$TICKET" ]]; then
  REVIEW_FILE=$(ls "$REVIEW_DIR" 2>/dev/null | grep "$TICKET" | head -1)
  if [[ -z "$REVIEW_FILE" ]]; then
    echo "[Code-Review Guard] 활성 티켓 ($TICKET)에 대한 리뷰 산출물 없음" >&2
    echo "기대: docs/03-code-review/${TICKET}-review.* (.md 또는 .html)" >&2
    exit 2
  fi
  REVIEW_PATH="$REVIEW_DIR/$REVIEW_FILE"

  # 3. 중요 변경 분류 — 변경된 파일 패턴 분석
  CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null)

  IS_CRITICAL=0
  CRITICAL_REASONS=()

  # === APS-1-3: 옵션 2 정책 동기화 ===
  # 진짜 위험 영역만 3중 검증 강제. 단순 외부 통합(MCP 도구 추가 등)은 2중으로 완화됨.
  # 정책 근거: .claude/rules/code-review.md (3단계 분류)

  # 보안 관련 (인증/세션/암호화) — 3중 강제
  if echo "$CHANGED_FILES" | grep -qE "(auth|session|crypto|password|token|jwt|oauth)" ; then
    IS_CRITICAL=1
    CRITICAL_REASONS+=("보안 관련 파일 변경")
  fi

  # DB 마이그레이션 — 3중 강제
  if echo "$CHANGED_FILES" | grep -qE "(migrate|migration|schema\.(sql|ts|js)|db/migrations)"; then
    IS_CRITICAL=1
    CRITICAL_REASONS+=("DB 마이그레이션 변경")
  fi

  # 결제/금전 — 3중 강제 (APS-1-3 추가)
  if echo "$CHANGED_FILES" | grep -qE "(payment|billing|invoice|stripe)"; then
    IS_CRITICAL=1
    CRITICAL_REASONS+=("결제 시스템 변경")
  fi

  # 권한 시스템 — 3중 강제 (APS-1-3 추가)
  if echo "$CHANGED_FILES" | grep -qE "(permission|rbac|acl|authoriz)"; then
    IS_CRITICAL=1
    CRITICAL_REASONS+=("권한 시스템 변경")
  fi

  # NOTE: 일반 외부 통합 패턴(mcp-server|api-server|webhook|external)은
  # 옵션 2 정책에 따라 2중 검증으로 완화되어 본 hook에서 제거됨 (APS-1-3).

  # 4. 중요 변경 시 codex review + challenge 흔적 확인
  if [[ $IS_CRITICAL -eq 1 ]]; then
    HAS_CODEX_REVIEW=0
    HAS_CODEX_CHALLENGE=0

    if grep -qiE "codex.{0,10}review" "$REVIEW_PATH" 2>/dev/null; then
      HAS_CODEX_REVIEW=1
    fi
    if grep -qiE "(codex.{0,10}challenge|adversarial|challenge mode)" "$REVIEW_PATH" 2>/dev/null; then
      HAS_CODEX_CHALLENGE=1
    fi

    NOTES_HAS_CODEX=0
    if echo "$NOTES" | grep -qiE "codex"; then
      NOTES_HAS_CODEX=1
    fi

    if [[ $HAS_CODEX_REVIEW -eq 0 || $HAS_CODEX_CHALLENGE -eq 0 ]] && [[ $NOTES_HAS_CODEX -eq 0 ]]; then
      echo "[Codex-Review Guard] 중요 변경 - 3중 검증 누락!" >&2
      echo "분류 사유:" >&2
      for r in "${CRITICAL_REASONS[@]}"; do
        echo "  - $r" >&2
      done
      cat >&2 <<EOF

CLAUDE.md 옵션 B 규칙: 중요 변경(P0/보안/아키텍처/DB/외부 통합)은 3중 검증 필수
  1. code-reviewer (Opus) - 통과 시 docs/03-code-review/ 에 기록됨
  2. codex review - "codex review" 키워드 포함 필요
  3. codex challenge - "challenge" 키워드 포함 필요

해결 방법:
- /codex review 또는 codex:rescue 스킬로 독립 리뷰 수행
- /codex challenge 모드로 적대적 검증 수행
- 결과를 ${REVIEW_FILE} 에 추가 기록
- approve_review notes에 "code-reviewer + codex review + challenge 3중 통과: ..." 명시
EOF
      exit 2
    fi
  fi
fi

# 5. notes 길이 검증 (서버에서도 검증하나 사전 차단)
if [[ ${#NOTES} -lt 20 ]]; then
  echo "[Code-Review Guard] approve_review notes는 20자 이상이어야 합니다 (현재: ${#NOTES}자)" >&2
  exit 2
fi

exit 0
