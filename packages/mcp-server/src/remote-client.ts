/**
 * Remote API Client for MCP Proxy Mode
 * API_URL 환경변수가 설정되면 로컬 DB 대신 원격 REST API를 호출합니다.
 */

const API_URL = process.env.API_URL;

export function isRemoteMode(): boolean {
  return !!API_URL;
}

async function get(path: string): Promise<unknown> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}

async function post(path: string, body?: unknown): Promise<unknown> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}

async function patch(path: string, body?: unknown): Promise<unknown> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}

async function del(path: string): Promise<unknown> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}

/**
 * MCP tool 이름과 args를 받아 원격 REST API 호출로 변환
 */
export async function executeRemote(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    // === Project ===
    case 'create_project':
      return post('/api/projects', args);
    case 'list_projects':
      return get('/api/projects');
    case 'get_project':
      return get(`/api/projects/${args.project_id}`);
    case 'create_epic':
      return post(`/api/projects/${args.project_id}/epics`, {
        title: args.title,
        description: args.description,
        priority: args.priority,
      });

    // === Task ===
    case 'create_task':
      return post('/api/tasks', { ...args, created_by: 'ai' });
    case 'decompose_task':
      return post(`/api/tasks/${args.task_id}/decompose`, { subtasks: args.subtasks });
    case 'update_task_status':
      return patch(`/api/tasks/${args.task_id}/status`, { status: args.status, notes: args.notes });
    case 'set_priority':
      return patch(`/api/tasks/${args.task_id}/priority`, { priority: args.priority, reason: args.reason });
    case 'add_dependency':
      return post(`/api/tasks/${args.task_id}/dependencies`, { depends_on_id: args.depends_on_id });
    case 'get_task':
      return get(`/api/tasks/${args.task_id}`);
    case 'list_tasks': {
      const params = new URLSearchParams();
      if (args.project_id) params.set('project_id', args.project_id as string);
      if (args.epic_id) params.set('epic_id', args.epic_id as string);
      if (args.status) params.set('status', args.status as string);
      if (args.assignee) params.set('assignee', args.assignee as string);
      const qs = params.toString();
      return get(`/api/tasks${qs ? `?${qs}` : ''}`);
    }

    // === Context ===
    case 'get_session_context':
      return get(`/api/projects/${args.project_id}/context`);
    case 'get_project_status':
      return get(`/api/projects/${args.project_id}/status`);
    case 'get_blocking_analysis':
      return get(`/api/projects/${args.project_id}/blocking`);

    // === Test & Fix ===
    case 'run_tests':
      return post(`/api/tasks/${args.task_id}/test-runs`, { results: args.results });
    case 'report_test_result':
      return post(`/api/tasks/${args.task_id}/test-result`, { result: args.result, failures: args.failures });
    case 'create_fix_task':
      return post(`/api/tasks/${args.parent_task_id}/fix`, {
        issue_description: args.issue_description,
        files_changed: args.files_changed,
      });
    case 'get_fix_history':
      return get(`/api/tasks/${args.task_id}/fix-history`);
    case 'escalate_to_human':
      return post(`/api/tasks/${args.task_id}/escalate`, { reason: args.reason });

    // === GitHub ===
    case 'link_pr_to_task':
      return post(`/api/tasks/${args.task_id}/link-pr`, { pr_url: args.pr_url });
    case 'get_pr_status':
      return get(`/api/tasks/${args.task_id}/pr-status`);
    case 'create_github_issue':
      return post(`/api/tasks/${args.task_id}/github-issue`, { project_id: args.project_id, labels: args.labels });
    case 'sync_commit_progress':
      return post(`/api/tasks/${args.task_id}/sync-commit`, {
        commit_hash: args.commit_hash,
        notes: args.notes,
        message: args.message,
        files_changed: args.files_changed,
        additions: args.additions,
        deletions: args.deletions,
      });

    // === Activity ===
    case 'get_task_activities': {
      const limit = args.limit || 20;
      return get(`/api/activities?task_id=${args.task_id}&limit=${limit}`);
    }
    case 'get_project_activities': {
      const limit = args.limit || 30;
      return get(`/api/projects/${args.project_id}/activities?limit=${limit}`);
    }

    // === Workflow (subagent) ===
    case 'smart_workflow':
      return post(`/api/workflow/${args.task_id}`, {
        action: args.action,
        test_results: args.test_results,
        notes: args.notes,
        issues: args.issues,
      });

    // === Time & Priority ===
    case 'get_task_time_summary':
      return get(`/api/tasks/${args.task_id}/time-summary`);
    case 'analyze_task_priority':
      return get(`/api/tasks/${args.task_id}/priority-analysis`);
    case 'get_priority_suggestions':
      return get(`/api/projects/${args.project_id}/priority-suggestions`);
    case 'get_workload_analysis':
      return get(`/api/projects/${args.project_id}/workload`);

    // === Assignee ===
    case 'suggest_assignee':
      return get(`/api/tasks/${args.task_id}/assignee-suggestion`);
    case 'get_assignment_recommendations':
      return get(`/api/projects/${args.project_id}/assignment-recommendations`);

    // === Import/Export ===
    case 'export_project':
      return get(`/api/projects/${args.project_id}/export?format=${args.format}`);
    case 'import_project':
      return post('/api/projects/import', { data: args.data, overwrite: args.overwrite });

    // === Templates ===
    case 'create_task_template':
      return post(`/api/projects/${args.project_id}/templates`, {
        name: args.name,
        description: args.description,
        priority: args.priority,
        estimated_hrs: args.estimated_hrs,
        subtasks: args.subtasks,
      });
    case 'list_task_templates':
      return get(`/api/projects/${args.project_id}/templates`);
    case 'apply_task_template':
      return post(`/api/templates/${args.template_id}/apply`, {
        title: args.title,
        epic_id: args.epic_id,
        description: args.description,
        priority: args.priority,
        estimated_hrs: args.estimated_hrs,
        assignee: args.assignee,
      });

    // === Analysis (subagent) ===
    case 'auto_analyze':
      return get(`/api/projects/${args.project_id}/analysis/${args.analysis_type}`);

    // === Automation (subagent) ===
    case 'manage_automation': {
      const action = args.action as string;
      switch (action) {
        case 'list':
          return get(`/api/projects/${args.project_id}/automation`);
        case 'create':
          return post(`/api/projects/${args.project_id}/automation`, {
            name: args.name,
            trigger_event: args.trigger_event,
            action_type: args.action_type,
            condition: args.condition,
            action_config: args.action_config,
          });
        case 'delete':
          return del(`/api/automation/${args.rule_id}`);
        case 'toggle':
          return patch(`/api/automation/${args.rule_id}/toggle`);
        default:
          throw new Error(`알 수 없는 자동화 액션: ${action}`);
      }
    }

    default:
      throw new Error(`Unknown remote tool: ${toolName}`);
  }
}
