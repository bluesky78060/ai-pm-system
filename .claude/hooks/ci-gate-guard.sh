#!/bin/bash
# ci-gate-guard.sh — PreToolUse hook for smart_workflow approve_review (APS-5-13 F-005).
#
# 역할(분기 ② C 2층 구조의 Fine 층): 서버 게이트(workflow-service.approveReview)가 못 하는
# fast-track/1중 changed-files 면제를 hook이 담당 + approve_review를 로컬에서 1차 빠르게 차단.
#
# 핵심 한계: hook은 로컬 1차 방어선일 뿐 — 서버 직접 호출은 우회 가능.
#            **Phase 3 서버 게이트(CI_GATE_PROJECTS)가 최종 권위**. 본 hook은 보조 UX.
# opt-in: .claude/ci-gate-enabled 마커 부재 시 전체 통과(회귀 0, 점진 도입). 마커는 .gitignore 등록.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [[ "$TOOL_NAME" != "mcp__ai-pm__smart_workflow" && "$TOOL_NAME" != "mcp__ai-pm-system__smart_workflow" ]]; then
  exit 0
fi

ACTION=$(echo "$INPUT" | jq -r '.tool_input.action // empty')
if [[ "$ACTION" != "approve_review" ]]; then
  exit 0
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[[ -z "$PROJECT_ROOT" ]] && exit 0

# opt-in: 마커 부재 시 통과 (서버 게이트가 백업)
[[ ! -f "$PROJECT_ROOT/.claude/ci-gate-enabled" ]] && exit 0

# fine-grained 면제: fast-track 마커 (plan-review-guard.sh 패턴 재사용)
TICKET=$(cat "$PROJECT_ROOT/.claude/active-ticket" 2>/dev/null | tr -d '[:space:]')
FT=$(cat "$PROJECT_ROOT/.claude/active-ticket-fasttrack" 2>/dev/null | tr -d '[:space:]')
if [[ -n "$FT" && "$FT" == "$TICKET" ]]; then
  echo "[CI-Gate Guard] fast-track 모드 활성 — CI 게이트 면제 ($TICKET)" >&2
  exit 0
fi

# gh CLI로 현재 브랜치 PR checks 조회 (gh auth 우선, GITHUB_TOKEN 폴백)
if ! command -v gh >/dev/null 2>&1; then
  echo "[CI-Gate Guard] gh CLI 미설치 — 건너뜀(서버 게이트가 백업)" >&2
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[[ -z "$BRANCH" ]] && exit 0

# gh pr checks: 실 PR 없음·gh 실패 시 통과(서버 게이트가 최종 권위).
BUCKETS=$(gh pr checks "$BRANCH" --json bucket 2>/dev/null | jq -r '[.[].bucket] | join(",")' 2>/dev/null)
if [[ -z "$BUCKETS" ]]; then
  echo "[CI-Gate Guard] PR/checks 조회 불가 — 건너뜀(서버 게이트가 백업)" >&2
  exit 0
fi

# bucket 값: pass / fail / pending / skipping / cancel.
# APS-5-13(보안 MINOR-4): deny-list(fail|cancel|pending 차단)는 미래에 새 bucket 값이 추가되면
# 그 값이 통과로 새어나간다(fail-open). allow-list로 전환 — 모든 bucket이 {pass, skipping}일 때만 통과.
# 그 외(알 수 없는 값 포함) bucket이 하나라도 있으면 보수적으로 차단(fail-closed).
NON_OK=$(echo "$BUCKETS" | tr ',' '\n' | grep -vE '^(pass|skipping)$' | grep -v '^$' | sort -u | paste -sd, -)
if [[ -n "$NON_OK" ]]; then
  echo "[CI-Gate Guard] approve_review 차단 — CI 미통과 (buckets: $BUCKETS, 비통과: $NON_OK)" >&2
  echo "  pass/skipping 외 bucket은 모두 차단(fail-closed). CI green 후 재시도하세요. 서버 게이트(CI_GATE_PROJECTS)도 동일 차단합니다." >&2
  exit 2
fi

exit 0
