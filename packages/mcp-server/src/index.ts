import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runMigrations } from './db/migrate.js';
import { ProjectService } from './services/project-service.js';
import { TaskService } from './services/task-service.js';
import { ContextService } from './services/context-service.js';
import { TestService } from './services/test-service.js';
import { GitHubService } from './services/github-service.js';
import { ActivityRepository } from './db/repositories/activity-repo.js';
import { WorkflowService } from './services/workflow-service.js';
import { AnalysisService } from './services/analysis-service.js';
import { AutomationService } from './services/automation-service.js';
import type { AutomationTrigger, AutomationAction } from './types/entities.js';
import { isRemoteMode, executeRemote } from './remote-client.js';

const ErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

function classifyError(error: Error): { code: string; message: string } {
  const msg = error.message;
  if (msg.includes('찾을 수 없습니다') || msg.includes('not found')) {
    return { code: ErrorCode.NOT_FOUND, message: msg };
  }
  if (msg.includes('전환할 수 없습니다') || msg.includes('transition')) {
    return { code: ErrorCode.INVALID_TRANSITION, message: msg };
  }
  if (msg.includes('순환') || msg.includes('circular')) {
    return { code: ErrorCode.CIRCULAR_DEPENDENCY, message: msg };
  }
  if (msg.includes('필수') || msg.includes('required') || msg.includes('invalid')) {
    return { code: ErrorCode.VALIDATION_ERROR, message: msg };
  }
  return { code: ErrorCode.UNKNOWN, message: msg };
}

// Initialize: local mode only (remote mode skips DB)
const remote = isRemoteMode();

const projectService = remote ? null! : new ProjectService();
const taskService = remote ? null! : new TaskService();
const contextService = remote ? null! : new ContextService();
const testService = remote ? null! : new TestService();
const githubService = remote ? null! : new GitHubService();
const activityRepo = remote ? null! : new ActivityRepository();
const workflowService = remote ? null! : new WorkflowService();
const analysisService = remote ? null! : new AnalysisService();
const automationService = remote ? null! : new AutomationService();

// Create MCP server
const server = new Server(
  { name: 'ai-pm-system', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// Register tools list
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Project tools
    {
      name: 'create_project',
      description: 'Create a new project',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Project name' },
          description: { type: 'string', description: 'Project description' },
          github_repo: { type: 'string', description: 'GitHub repo (owner/repo)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'list_projects',
      description: 'List all projects',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'get_project',
      description: 'Get project details with epics',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
        },
        required: ['project_id'],
      },
    },
    {
      name: 'create_epic',
      description: 'Create an epic in a project',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          title: { type: 'string', description: 'Epic title' },
          description: { type: 'string', description: 'Epic description' },
          priority: { type: 'number', description: 'Priority 1-5' },
        },
        required: ['project_id', 'title'],
      },
    },
    // Task tools
    {
      name: 'create_task',
      description: 'Create a new task. AI can autonomously create tasks without approval.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Task title' },
          project_id: { type: 'string', description: 'Project ID (used to find epic)' },
          epic_id: { type: 'string', description: 'Epic ID' },
          description: { type: 'string', description: 'Task description' },
          priority: { type: 'number', description: 'Priority 1(high)-5(low), default 3' },
          assignee: { type: 'string', description: 'ai | human | username' },
          parent_id: { type: 'string', description: 'Parent task ID for subtasks' },
        },
        required: ['title'],
      },
    },
    {
      name: 'decompose_task',
      description: 'Decompose a task into subtasks automatically',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task to decompose' },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'number' },
                estimated_hrs: { type: 'number' },
              },
              required: ['title'],
            },
          },
        },
        required: ['task_id', 'subtasks'],
      },
    },
    {
      name: 'update_task_status',
      description: 'Update task status with validation. Valid: todo→in_progress|blocked, in_progress→testing|blocked|todo, testing→fixing|review|blocked, fixing→testing|blocked, review→done|in_progress, done→in_progress, blocked→todo|in_progress',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'testing', 'fixing', 'review', 'done', 'blocked'] },
          notes: { type: 'string' },
        },
        required: ['task_id', 'status'],
      },
    },
    {
      name: 'set_priority',
      description: 'Set task priority with reason tracking',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string' },
          priority: { type: 'number', description: '1(highest) to 5(lowest)' },
          reason: { type: 'string', description: 'Why this priority change' },
        },
        required: ['task_id', 'priority', 'reason'],
      },
    },
    {
      name: 'add_dependency',
      description: 'Add dependency between tasks. Circular dependencies are detected and rejected.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task that depends on another' },
          depends_on_id: { type: 'string', description: 'Prerequisite task' },
        },
        required: ['task_id', 'depends_on_id'],
      },
    },
    {
      name: 'get_task',
      description: 'Get task details with subtasks',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'list_tasks',
      description: 'List tasks with filters',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string' },
          epic_id: { type: 'string' },
          status: { type: 'string' },
          assignee: { type: 'string' },
        },
      },
    },
    // Context tools (Phase 2)
    {
      name: 'get_session_context',
      description: 'Get session context for AI agent. Returns current tasks, progress, blocking analysis, and next recommended task. Call this at the start of each session.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
        },
        required: ['project_id'],
      },
    },
    {
      name: 'get_project_status',
      description: 'Get full project status dashboard with epic-level progress and completion rates',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
        },
        required: ['project_id'],
      },
    },
    {
      name: 'get_blocking_analysis',
      description: 'Analyze blocked and delayed tasks. Returns critical path, blocked dependents, and suggested actions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
        },
        required: ['project_id'],
      },
    },
    // Test & Fix tools (Phase 3)
    {
      name: 'run_tests',
      description: 'Record test execution results for a task. Automatically increments run number.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          results: {
            type: 'array',
            description: 'Test results array',
            items: {
              type: 'object',
              properties: {
                test_type: { type: 'string', enum: ['unit', 'type', 'lint', 'integration', 'build'], description: 'Type of test' },
                status: { type: 'string', enum: ['pass', 'fail', 'skip'], description: 'Test result' },
                output: { type: 'string', description: 'Test output' },
                failures: { type: 'string', description: 'JSON failure details' },
                duration_ms: { type: 'number', description: 'Duration in ms' },
              },
              required: ['test_type', 'status'],
            },
          },
        },
        required: ['task_id', 'results'],
      },
    },
    {
      name: 'report_test_result',
      description: 'Report overall test result. Pass → review, Fail → fixing (auto-retry up to 3x) or blocked (escalation).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          result: { type: 'string', enum: ['pass', 'fail'], description: 'Overall test result' },
          failures: {
            type: 'array',
            description: 'Failure details',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                line: { type: 'number' },
                message: { type: 'string' },
              },
              required: ['message'],
            },
          },
        },
        required: ['task_id', 'result'],
      },
    },
    {
      name: 'create_fix_task',
      description: 'Create a fix subtask for a failed test. Records fix attempt (max 3).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          parent_task_id: { type: 'string', description: 'Parent task to fix' },
          issue_description: { type: 'string', description: 'What needs to be fixed' },
          files_changed: {
            type: 'array',
            description: 'Files that were changed',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                diff: { type: 'string' },
              },
              required: ['path'],
            },
          },
        },
        required: ['parent_task_id', 'issue_description'],
      },
    },
    {
      name: 'get_fix_history',
      description: 'Get all test runs and fix attempts history for a task',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'escalate_to_human',
      description: 'Escalate a task to human intervention. Sets task to blocked with reason.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          reason: { type: 'string', description: 'Why escalation is needed' },
        },
        required: ['task_id', 'reason'],
      },
    },
    // GitHub tools (Phase 4)
    {
      name: 'link_pr_to_task',
      description: 'Link a GitHub PR URL to a task. Updates task record with PR reference.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          pr_url: { type: 'string', description: 'GitHub PR URL' },
        },
        required: ['task_id', 'pr_url'],
      },
    },
    {
      name: 'get_pr_status',
      description: 'Get live PR status from GitHub API. Returns state, mergeability, review status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID with linked PR' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'create_github_issue',
      description: 'Create a GitHub Issue from a task. Requires GITHUB_TOKEN env and project github_repo setting.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          project_id: { type: 'string', description: 'Project ID (for repo info)' },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Issue labels',
          },
        },
        required: ['task_id', 'project_id'],
      },
    },
    {
      name: 'sync_commit_progress',
      description: 'Record a commit hash against a task for progress tracking.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          commit_hash: { type: 'string', description: 'Git commit hash' },
          notes: { type: 'string', description: 'Progress notes' },
          message: { type: 'string', description: 'Commit message' },
          files_changed: { type: 'number', description: 'Number of files changed in the commit' },
          additions: { type: 'number', description: 'Number of lines added' },
          deletions: { type: 'number', description: 'Number of lines deleted' },
        },
        required: ['task_id', 'commit_hash'],
      },
    },
    // Activity tools
    {
      name: 'get_task_activities',
      description: 'Get activity log for a specific task. Returns status changes, creation, and other events.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID or ticket code (e.g. APS-1-3)' },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'get_project_activities',
      description: 'Get recent activity log for all tasks in a project.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          limit: { type: 'number', description: 'Max results (default 30)' },
        },
        required: ['project_id'],
      },
    },
    // Subagent tools
    {
      name: 'smart_workflow',
      description: 'Execute compound workflow actions in a single call. Combines status transitions, test recording, and context retrieval.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID or ticket code' },
          action: { type: 'string', enum: ['start_work', 'submit_test', 'complete_fix', 'approve_review'], description: 'Workflow action' },
          test_results: {
            type: 'array', description: 'Test results (required for submit_test)',
            items: {
              type: 'object',
              properties: {
                test_type: { type: 'string', enum: ['unit', 'type', 'lint', 'integration', 'build'] },
                status: { type: 'string', enum: ['pass', 'fail', 'skip'] },
                output: { type: 'string' },
                failures: { type: 'string' },
                duration_ms: { type: 'number' },
              },
              required: ['test_type', 'status'],
            },
          },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['task_id', 'action'],
      },
    },
    {
      name: 'auto_analyze',
      description: 'Run automated project analysis: daily report, bottleneck detection, or velocity metrics.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          analysis_type: { type: 'string', enum: ['daily_report', 'bottleneck', 'velocity'], description: 'Type of analysis' },
        },
        required: ['project_id', 'analysis_type'],
      },
    },
    {
      name: 'manage_automation',
      description: 'Manage automation rules for event-driven actions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'delete', 'toggle'], description: 'CRUD action' },
          project_id: { type: 'string', description: 'Project ID (required for list/create)' },
          rule_id: { type: 'string', description: 'Rule ID (required for delete/toggle)' },
          name: { type: 'string', description: 'Rule name (for create)' },
          trigger_event: { type: 'string', enum: ['epic_completed', 'task_stale', 'all_tests_pass', 'status_change'], description: 'Trigger event (for create)' },
          action_type: { type: 'string', enum: ['notify', 'auto_transition', 'create_task'], description: 'Action type (for create)' },
          condition: { type: 'string', description: 'JSON condition (for create)' },
          action_config: { type: 'string', description: 'JSON action config (for create)' },
        },
        required: ['action'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    // Remote mode: proxy all calls to REST API
    if (remote) {
      const result = await executeRemote(name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    // Local mode: direct service calls
    let result: unknown;

    switch (name) {
      // Project tools
      case 'create_project': {
        result = await projectService.create({
          name: args?.name as string,
          description: args?.description as string | undefined,
          github_repo: args?.github_repo as string | undefined,
        });
        break;
      }
      case 'list_projects': {
        result = { projects: await projectService.getAll() };
        break;
      }
      case 'get_project': {
        const project = await projectService.getById(args?.project_id as string);
        if (!project) throw new Error(`프로젝트를 찾을 수 없습니다: ${args?.project_id}`);
        const epics = await projectService.getEpics(project.id);
        result = { project, epics };
        break;
      }
      case 'create_epic': {
        result = await projectService.createEpic({
          project_id: args?.project_id as string,
          title: args?.title as string,
          description: args?.description as string | undefined,
          priority: args?.priority as number | undefined,
        });
        break;
      }
      // Task tools
      case 'create_task': {
        result = await taskService.create({
          title: args?.title as string,
          epic_id: args?.epic_id as string | undefined,
          description: args?.description as string | undefined,
          priority: args?.priority as number | undefined,
          assignee: args?.assignee as string | undefined,
          parent_id: args?.parent_id as string | undefined,
          created_by: 'ai',
        });
        break;
      }
      case 'decompose_task': {
        result = await taskService.decompose(
          args?.task_id as string,
          args?.subtasks as { title: string; description?: string; priority?: number; estimated_hrs?: number }[],
        );
        break;
      }
      case 'update_task_status': {
        result = await taskService.updateStatus(
          args?.task_id as string,
          args?.status as string,
          args?.notes as string | undefined,
        );
        break;
      }
      case 'set_priority': {
        result = await taskService.setPriority(
          args?.task_id as string,
          args?.priority as number,
          args?.reason as string,
        );
        break;
      }
      case 'add_dependency': {
        result = await taskService.addDependency(
          args?.task_id as string,
          args?.depends_on_id as string,
        );
        break;
      }
      case 'get_task': {
        const task = await taskService.getById(args?.task_id as string);
        if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${args?.task_id}`);
        const subtasks = await taskService.getSubtasks(task.id);
        result = { task, subtasks };
        break;
      }
      case 'list_tasks': {
        result = {
          tasks: await taskService.getAll({
            project_id: args?.project_id as string | undefined,
            epic_id: args?.epic_id as string | undefined,
            status: args?.status as string | undefined,
            assignee: args?.assignee as string | undefined,
          }),
        };
        break;
      }
      // Context tools (Phase 2)
      case 'get_session_context': {
        result = await contextService.getSessionContext(args?.project_id as string);
        break;
      }
      case 'get_project_status': {
        result = await contextService.getProjectStatus(args?.project_id as string);
        break;
      }
      case 'get_blocking_analysis': {
        result = await contextService.getBlockingAnalysis(args?.project_id as string);
        break;
      }
      // Test & Fix tools (Phase 3)
      case 'run_tests': {
        result = await testService.runTests(
          args?.task_id as string,
          args?.results as { test_type: string; status: string; output?: string; failures?: string; duration_ms?: number }[],
        );
        break;
      }
      case 'report_test_result': {
        result = await testService.reportTestResult(
          args?.task_id as string,
          args?.result as 'pass' | 'fail',
          args?.failures as { file?: string; line?: number; message: string }[] | undefined,
        );
        break;
      }
      case 'create_fix_task': {
        result = await testService.createFixTask(
          args?.parent_task_id as string,
          args?.issue_description as string,
          args?.files_changed as { path: string; diff?: string }[] | undefined,
        );
        break;
      }
      case 'get_fix_history': {
        result = await testService.getFixHistory(args?.task_id as string);
        break;
      }
      case 'escalate_to_human': {
        result = await testService.escalateToHuman(
          args?.task_id as string,
          args?.reason as string,
        );
        break;
      }
      // GitHub tools (Phase 4)
      case 'link_pr_to_task': {
        result = await githubService.linkPrToTask(
          args?.task_id as string,
          args?.pr_url as string,
        );
        break;
      }
      case 'get_pr_status': {
        result = await githubService.getPrStatus(args?.task_id as string);
        break;
      }
      case 'create_github_issue': {
        result = await githubService.createGithubIssue(
          args?.task_id as string,
          args?.project_id as string,
          args?.labels as string[] | undefined,
        );
        break;
      }
      case 'sync_commit_progress': {
        result = await githubService.syncCommitProgress(
          args?.task_id as string,
          args?.commit_hash as string,
          args?.notes as string | undefined,
          args?.message as string | undefined,
          args?.files_changed as number | undefined,
          args?.additions as number | undefined,
          args?.deletions as number | undefined,
        );
        break;
      }
      // Activity tools
      case 'get_task_activities': {
        const task = await taskService.getById(args?.task_id as string);
        if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${args?.task_id}`);
        const limit = (args?.limit as number) || 20;
        result = { activities: await activityRepo.findByTask(task.id, limit) };
        break;
      }
      case 'get_project_activities': {
        const projectId = args?.project_id as string;
        const projLimit = (args?.limit as number) || 30;
        const tasks = await taskService.getAll({ project_id: projectId });
        const taskIds = tasks.map(t => t.id);
        if (taskIds.length === 0) {
          result = { activities: [] };
        } else {
          const activityArrays = await Promise.all(taskIds.map(tid => activityRepo.findByTask(tid, projLimit)));
          const allActivities = activityArrays.flat();
          allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          result = { activities: allActivities.slice(0, projLimit) };
        }
        break;
      }
      // Subagent tools
      case 'smart_workflow': {
        const action = args?.action as string;
        switch (action) {
          case 'start_work':
            result = await workflowService.startWork(args?.task_id as string);
            break;
          case 'submit_test':
            result = await workflowService.submitTest(
              args?.task_id as string,
              args?.test_results as { test_type: string; status: string; output?: string; failures?: string; duration_ms?: number }[],
            );
            break;
          case 'complete_fix':
            result = await workflowService.completeFix(args?.task_id as string, args?.notes as string | undefined);
            break;
          case 'approve_review':
            result = await workflowService.approveReview(args?.task_id as string, args?.notes as string | undefined);
            break;
          default:
            throw new Error(`알 수 없는 워크플로우 액션: ${action}`);
        }
        break;
      }
      case 'auto_analyze': {
        const analysisType = args?.analysis_type as string;
        switch (analysisType) {
          case 'daily_report':
            result = await analysisService.dailyReport(args?.project_id as string);
            break;
          case 'bottleneck':
            result = await analysisService.bottleneck(args?.project_id as string);
            break;
          case 'velocity':
            result = await analysisService.velocity(args?.project_id as string);
            break;
          default:
            throw new Error(`알 수 없는 분석 타입: ${analysisType}`);
        }
        break;
      }
      case 'manage_automation': {
        const automationAction = args?.action as string;
        switch (automationAction) {
          case 'list':
            result = { rules: await automationService.listRules(args?.project_id as string) };
            break;
          case 'create':
            result = await automationService.createRule(
              args?.project_id as string,
              args?.name as string,
              args?.trigger_event as AutomationTrigger,
              args?.action_type as AutomationAction,
              args?.condition as string | undefined,
              args?.action_config as string | undefined,
            );
            break;
          case 'delete':
            await automationService.deleteRule(args?.rule_id as string);
            result = { message: '규칙 삭제 완료' };
            break;
          case 'toggle':
            result = await automationService.toggleRule(args?.rule_id as string);
            break;
          default:
            throw new Error(`알 수 없는 자동화 액션: ${automationAction}`);
        }
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const classified = classifyError(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: classified.code, message: classified.message }) }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  if (!remote) {
    await runMigrations();
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AI PM MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
