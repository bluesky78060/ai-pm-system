#!/bin/bash
# workflow-remind.sh — PreToolUse hook for workflow rule enforcement
# smart_workflow / update_task_status 호출 시 워크플로우 규칙을 리마인드합니다.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

case "$TOOL_NAME" in
  mcp__ai-pm-system__smart_workflow|mcp__ai-pm-system__update_task_status)
    ;;
  *)
    exit 0
    ;;
esac

ACTION=$(echo "$INPUT" | jq -r '.tool_input.action // empty')

if [[ "$TOOL_NAME" == *"update_task_status"* ]]; then
  NEW_STATUS=$(echo "$INPUT" | jq -r '.tool_input.status // empty')
  if [[ "$NEW_STATUS" == "review" || "$NEW_STATUS" == "done" ]]; then
    cat <<'MSG'
{"additionalContext": "[WORKFLOW RULE] testing→review, review→done은 update_task_status로 직접 전환 불가합니다. smart_workflow의 submit_test/approve_review를 사용하세요."}
MSG
    exit 0
  fi
fi

case "$ACTION" in
  submit_test)
    cat <<'MSG'
{"additionalContext": "[WORKFLOW RULE] submit_test 전 필수: 1) pnpm -r build 실제 실행 2) test_results에 build 타입 포함 3) output 10자 이상 실제 출력. 빌드 실패시 build-fixer 에이전트 사용."}
MSG
    ;;
  approve_review)
    cat <<'MSG'
{"additionalContext": "[WORKFLOW RULE] approve_review 전 필수: code-reviewer(opus) 에이전트 또는 /code-review 스킬로 실제 리뷰 수행. notes 20자 이상 리뷰 결과 포함."}
MSG
    ;;
  start_work)
    cat <<'MSG'
{"additionalContext": "[WORKFLOW RULE] start_work 후: executor/designer 에이전트에 위임하여 코드 작성. 복잡도별 선택 - 단순: executor-low(haiku), 표준: executor(sonnet), 복잡: executor-high(opus). 스킬: /autopilot, /ultrawork, /ecomode 활용 가능."}
MSG
    ;;
  *)
    exit 0
    ;;
esac

exit 0
