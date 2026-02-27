export type ProjectStatus = 'active' | 'archived';
export type EpicStatus = 'todo' | 'in_progress' | 'done';
export type TaskStatus = 'todo' | 'in_progress' | 'testing' | 'fixing' | 'review' | 'done' | 'blocked';
export type TestType = 'unit' | 'type' | 'lint' | 'integration' | 'build';
export type TestStatus = 'pass' | 'fail' | 'skip';
export type Actor = 'ai' | 'human' | 'github' | 'system';
export type FixResultStatus = 'pass' | 'fail' | 'escalated';

export interface Project {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  github_repo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Epic {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: EpicStatus;
  priority: number;
  order_index: number;
  seq: number | null;
  created_at: string;
}

export interface Task {
  id: string;
  epic_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  assignee: string;
  github_issue: string | null;
  github_pr: string | null;
  estimated_hrs: number | null;
  actual_hrs: number | null;
  blocked_by: string | null;
  created_by: 'ai' | 'human';
  seq: number | null;
  ticket_code: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TaskDependency {
  task_id: string;
  depends_on: string;
}

export interface ActivityLog {
  id: number;
  task_id: string | null;
  actor: Actor;
  action: string;
  payload: string | null;
  created_at: string;
}

export interface TestRun {
  id: string;
  task_id: string;
  run_number: number;
  test_type: TestType;
  status: TestStatus;
  output: string | null;
  failures: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface FixAttempt {
  id: string;
  task_id: string;
  attempt_number: number;
  trigger_run_id: string | null;
  files_changed: string | null;
  fix_description: string | null;
  result_status: FixResultStatus;
  created_at: string;
}

export interface TestFailure {
  test_name: string;
  error_message: string;
  file_path?: string;
  line_number?: number;
}

export interface FileChange {
  file_path: string;
  change_type: 'create' | 'modify' | 'delete';
  diff_summary?: string;
}

export type WorkflowAction = 'start_work' | 'submit_test' | 'complete_fix' | 'approve_review';
export type AnalysisType = 'daily_report' | 'bottleneck' | 'velocity';
export type AutomationTrigger = 'epic_completed' | 'task_stale' | 'all_tests_pass' | 'status_change';
export type AutomationAction = 'notify' | 'auto_transition' | 'create_task';

export interface AutomationRule {
  id: string;
  project_id: string;
  name: string;
  trigger_event: AutomationTrigger;
  condition: string | null;  // JSON condition
  action_type: AutomationAction;
  action_config: string | null;  // JSON config
  enabled: boolean;
  created_at: string;
}
