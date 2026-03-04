#!/bin/bash
# AI PM System Plugin Installation Script

set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 Installing AI PM System Plugin..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18+ required (current: $(node -v))"
  exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  echo "❌ Error: pnpm not found. Install with: npm install -g pnpm"
  exit 1
fi

echo "📦 Installing dependencies..."
cd "$PLUGIN_DIR"
pnpm install

echo "🔨 Building packages..."
pnpm -r build

echo "🗄️ Initializing database..."
mkdir -p "$PLUGIN_DIR/data"

echo "✅ AI PM System Plugin installed successfully!"
echo ""
echo "Next steps:"
echo "1. Add plugin to Claude Code settings:"
echo "   {\"enabledPlugins\": {\"ai-pm-system@local\": true}}"
echo ""
echo "2. Or use directory marketplace:"
echo "   /plugins add directory $PLUGIN_DIR"
echo ""
echo "3. Restart Claude Code"
echo ""
echo "See .claude-plugin/README.md for usage instructions."
