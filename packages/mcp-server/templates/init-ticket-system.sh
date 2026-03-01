#!/bin/bash
# init-ticket-system.sh
# 새 프로젝트에 AI PM Ticket-First 시스템을 설치합니다.
#
# 사용법:
#   bash /path/to/ai-pm-system/packages/mcp-server/templates/init-ticket-system.sh
#
# 또는 짧은 alias:
#   bash ~/ai-pm-system/packages/mcp-server/templates/init-ticket-system.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(pwd)"

echo "=== AI PM Ticket-First System 설치 ==="
echo "프로젝트: $PROJECT_ROOT"
echo ""

# 1. .claude/hooks 디렉토리 생성
mkdir -p "$PROJECT_ROOT/.claude/hooks"
echo "[1/4] .claude/hooks/ 디렉토리 생성"

# 2. ticket-guard.sh 복사
cp "$SCRIPT_DIR/ticket-guard.sh" "$PROJECT_ROOT/.claude/hooks/ticket-guard.sh"
chmod +x "$PROJECT_ROOT/.claude/hooks/ticket-guard.sh"
echo "[2/4] ticket-guard.sh hook 설치"

# 3. settings.local.json 생성 (기존 파일이 있으면 병합)
SETTINGS_FILE="$PROJECT_ROOT/.claude/settings.local.json"
if [[ -f "$SETTINGS_FILE" ]]; then
  # 기존 파일에 hooks 추가 (jq 사용)
  if command -v jq &>/dev/null; then
    HOOK_CONFIG='{"PreToolUse":[{"matcher":"Edit|Write","hooks":[{"type":"command","command":".claude/hooks/ticket-guard.sh"}]}]}'
    jq --argjson hooks "$HOOK_CONFIG" '.hooks = $hooks' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "[3/4] settings.local.json에 hook 병합 완료"
  else
    echo "[3/4] ⚠️  jq가 없어 settings.local.json 자동 병합 불가. 수동으로 hooks를 추가하세요."
  fi
else
  cat > "$SETTINGS_FILE" <<'JSON'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/ticket-guard.sh"
          }
        ]
      }
    ]
  }
}
JSON
  echo "[3/4] settings.local.json 생성"
fi

# 4. CLAUDE.md에 Ticket-First 규칙 추가 (없으면 생성, 있으면 prepend)
CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
if [[ -f "$CLAUDE_MD" ]]; then
  # 이미 Ticket-First 규칙이 있는지 확인
  if grep -q "Ticket-First" "$CLAUDE_MD"; then
    echo "[4/4] CLAUDE.md에 이미 Ticket-First 규칙이 있습니다. 건너뜀."
  else
    # 기존 내용 앞에 추가
    TEMP=$(mktemp)
    cp "$SCRIPT_DIR/CLAUDE.md" "$TEMP"
    echo "" >> "$TEMP"
    echo "---" >> "$TEMP"
    echo "" >> "$TEMP"
    cat "$CLAUDE_MD" >> "$TEMP"
    mv "$TEMP" "$CLAUDE_MD"
    echo "[4/4] CLAUDE.md에 Ticket-First 규칙 추가 (기존 내용 유지)"
  fi
else
  cp "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_MD"
  echo "[4/4] CLAUDE.md 생성"
fi

# .gitignore에 active-ticket 추가
GITIGNORE="$PROJECT_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]]; then
  if ! grep -q "active-ticket" "$GITIGNORE"; then
    echo ".claude/active-ticket" >> "$GITIGNORE"
    echo "      .gitignore에 .claude/active-ticket 추가"
  fi
  if ! grep -q "settings.local.json" "$GITIGNORE"; then
    echo ".claude/settings.local.json" >> "$GITIGNORE"
    echo "      .gitignore에 .claude/settings.local.json 추가"
  fi
fi

echo ""
echo "=== 설치 완료 ==="
echo ""
echo "사용법:"
echo "  1. Claude Code에서 프로젝트를 열면 자동 적용"
echo "  2. 소스 코드 수정 시 티켓이 없으면 자동 차단"
echo "  3. 티켓 활성화: echo 'PRJ-1-1' > .claude/active-ticket"
echo "  4. 티켓 해제:   rm .claude/active-ticket"
