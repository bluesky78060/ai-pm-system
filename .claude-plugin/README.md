# AI PM System - Claude Code Plugin

AI-powered project management system with strict ticket-first development workflow.

## Features

- **Ticket-First Development**: All code changes require ticket creation
- **Smart Workflow**: Automated state transitions with validation
- **Agent Integration**: Works seamlessly with Claude Code agents
- **Workflow Enforcement**: Hooks prevent common mistakes
- **Compaction-Resistant**: Session persistence via hooks and AGENTS.md

## Installation

### From Local Directory

```bash
# In Claude Code
/plugins add directory /path/to/ai-pm-system

# Or manually add to settings
{
  "extraKnownMarketplaces": {
    "ai-pm-local": {
      "source": "directory",
      "path": "/Users/leechanhee/ai-pm-system"
    }
  },
  "enabledPlugins": {
    "ai-pm-system@ai-pm-local": true
  }
}
```

### From GitHub (Future)

```bash
/plugins add github your-org/ai-pm-system
```

## Usage

### Quick Start

1. **Create Project**
   ```typescript
   create_project({
     code: "PROJ",
     name: "My Project",
     description: "Project description"
   })
   ```

2. **Create Epic**
   ```typescript
   create_epic({
     project_id: "project-uuid",
     title: "Feature Epic",
     description: "Epic description"
   })
   ```

3. **Create Task**
   ```typescript
   create_task({
     project_id: "project-uuid",
     epic_id: "epic-uuid",
     title: "Task title",
     description: "Task description",
     priority: "medium"
   })
   ```

4. **Follow Workflow**
   ```typescript
   // Start work
   smart_workflow(task_id, 'start_work')

   // After coding: submit test
   smart_workflow(task_id, 'submit_test', {
     test_results: [{
       type: "build",
       status: "passed",
       output: "Build succeeded"
     }]
   })

   // After review: approve
   smart_workflow(task_id, 'approve_review', {
     notes: "Code review passed"
   })
   ```

## Available Tools

| Tool | Description |
|------|-------------|
| `create_project` | Create new project |
| `get_project_status` | Get project overview |
| `create_epic` | Create epic (feature group) |
| `create_task` | Create task with epic_id |
| `update_task_status` | Update task status (limited) |
| `smart_workflow` | Smart state transitions |
| `add_comment` | Add comment to task |
| `get_task_history` | Get task activity log |
| `get_active_tasks` | List in-progress tasks |

## Workflow Rules

### Required Flow

```
1. get_project_status → Get epic_id
2. create_task(epic_id=...) → Get task_id
3. smart_workflow(task_id, 'start_work') → in_progress
4. [Code via agents: executor/designer]
5. pnpm -r build → Get results
6. smart_workflow(task_id, 'submit_test', test_results=[...])
7. [Review via code-reviewer agent]
8. smart_workflow(task_id, 'approve_review', notes='...')
9. Auto-transition to done ✅
```

### Forbidden Actions

- ❌ Code changes without ticket
- ❌ Direct `update_task_status` to review/done (server blocks)
- ❌ `submit_test` without build
- ❌ `approve_review` without code-reviewer

## Integration with Agents

### Recommended Agent Mapping

| Task Complexity | Agent | Model |
|----------------|-------|-------|
| Simple | `executor-low` | haiku |
| Standard | `executor` | sonnet |
| Complex | `executor-high` | opus |
| UI/Frontend | `designer` | sonnet |
| Code Review | `code-reviewer` | opus |

### Skills Integration

- `/autopilot`: Full autonomous execution
- `/ultrawork`: Parallel execution
- `/ecomode`: Token-efficient parallel
- `/code-review`: Code review workflow

## Project Files

- `CLAUDE.md`: Project rules (always in context)
- `AGENTS.md`: AI agent guide (compaction-resistant)
- `docs/workflow-guide.md`: Detailed workflow
- `.claude/hooks/`: Workflow enforcement hooks

## Hooks

### SessionStart Hook
- Auto-loads PM system context on session start
- Prevents context loss after compaction

### PreToolUse Hooks
- `ticket-guard.sh`: Blocks Edit/Write without ticket
- `workflow-remind.sh`: Reminds workflow rules

## Configuration

### Database Path
Default: `{{PLUGIN_DIR}}/data/pm.db`

Override via env:
```json
{
  "env": {
    "DB_PATH": "/custom/path/pm.db"
  }
}
```

### Tech Stack
- Backend: Node.js, TypeScript, Express, PostgreSQL
- Frontend: React 19, Vite 6, Tailwind CSS v4
- Monorepo: pnpm workspaces

## Development

### Build
```bash
pnpm install
pnpm -r build
```

### Test
```bash
pnpm --filter @ai-pm/mcp-server test
```

### MCP Server
```bash
# Start MCP server
pnpm --filter @ai-pm/mcp-server start

# Or via .mcp.json
node packages/mcp-server/dist/index.js
```

## Troubleshooting

### Plugin Not Loading
```bash
# Check plugin status
/plugins list

# Verify installation
ls -la ~/.claude/plugins/ai-pm-system/
```

### MCP Server Not Starting
```bash
# Check build
pnpm -r build

# Check server directly
node packages/mcp-server/dist/index.js
```

### Workflow Blocked
See `AGENTS.md` and `CLAUDE.md` for complete workflow rules.

## License

MIT

## Support

- Documentation: `AGENTS.md`, `CLAUDE.md`
- Workflow Guide: `docs/workflow-guide.md`
- Issues: GitHub Issues (if published)
