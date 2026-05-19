#!/bin/bash
# workflow-stop-check.sh — Stop hook
# AI가 turn 종료할 때 .claude/state/active-workflow 파일이 있으면 silent-stop 경고.
# 차단하지 않고 stderr 안내만 (false positive 방지 — BLOCKED/CRITICAL 보고도 같은 경로).
# continuous-execution.md silent-stop 금지 규정 지원.

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$PROJECT_ROOT" ]]; then
  exit 0
fi

STATE_FILE="$PROJECT_ROOT/.claude/state/active-workflow"

if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

CONTENT=$(cat "$STATE_FILE" 2>/dev/null)
if [[ -z "$CONTENT" ]]; then
  exit 0
fi

# 형식: TICKET|STATUS|TIMESTAMP
TICKET=$(echo "$CONTENT" | cut -d'|' -f1)
STATUS=$(echo "$CONTENT" | cut -d'|' -f2)
TS=$(echo "$CONTENT" | cut -d'|' -f3)

cat >&2 <<EOF
[Workflow Stop Check] ⚠ 워크플로우 진행 중에 turn 종료됨
  - 활성 티켓: $TICKET
  - 현재 상태: $STATUS
  - 마지막 전이: $TS

continuous-execution.md 원칙: 예외 4가지 (BLOCKED / 모호한 의사결정 / CRITICAL / self-healing 3회 실패)
가 아니면 같은 응답 안에 다음 도구 호출 포함해야 합니다.

다음 단계 가이드 (smart_workflow action enum: start_work | submit_test | complete_fix | approve_review | request_changes):
  - in_progress → 빌드/테스트 실행 후 smart_workflow(action=submit_test)
  - testing → 빌드 실패 시 build-fixer 위임 후 smart_workflow(action=complete_fix), 통과 시 자동 review 전환
  - review → code-reviewer 위임 → smart_workflow(action=approve_review) 또는 issues 발견 시 request_changes
  - fixing → 수정 후 smart_workflow(action=complete_fix) → testing 재진입

정상 종료 케이스 (예외 진입 후 사용자 보고)였다면 이 경고는 무시하세요.
참조: .claude/rules/workflow-steps.md, .claude/rules/continuous-execution.md
EOF

exit 0
