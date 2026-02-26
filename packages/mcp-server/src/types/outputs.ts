import type { Epic, Project, Task } from './entities.js';

export interface CreateTaskOutput {
  task: Task;
  message: string;
}

export interface UpdateTaskStatusOutput {
  task: Task;
  previousStatus: string;
  message: string;
}

export interface DecomposeTaskOutput {
  parentTask: Task;
  subtasks: Task[];
  message: string;
}

export interface ProjectStatusOutput {
  project: Project;
  epics: (Epic & { taskCount: number; completedCount: number; rate: number })[];
  summary: {
    totalEpics: number;
    totalTasks: number;
    completionRate: number;
    statusBreakdown: Record<string, number>;
  };
}

export interface SessionContext {
  project: {
    id: string;
    name: string;
    status: string;
    githubRepo: string | null;
  };
  currentTasks: {
    inProgress: Task[];
    testing: Task[];
    blocked: Task[];
  };
  recentlyCompleted: {
    tasks: Task[];
    lastCompletedAt: string | null;
  };
  progress: {
    totalTasks: number;
    completed: number;
    inProgress: number;
    blocked: number;
    completionRate: number;
    byEpic: { epicId: string; epicTitle: string; total: number; completed: number; rate: number }[];
  };
  nextRecommended: {
    task: Task;
    reason: string;
  } | null;
}

export interface BlockingIssue {
  task: Task;
  blockedSince: string;
  reason: string | null;
  blockedDependents: Task[];
  suggestedAction: string;
}

export interface BlockingAnalysis {
  projectId: string;
  totalBlocked: number;
  criticalPath: BlockingIssue[];
  delayedTasks: Task[];
  summary: string;
}
