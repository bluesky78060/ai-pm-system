import { TaskRepository } from '../db/repositories/task-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { ProjectRepository } from '../db/repositories/project-repo.js';
import { getPool } from '../db/connection.js';
import type { Task, ActivityLog } from '../types/index.js';

const projectRepo = new ProjectRepository();
const epicRepo = new EpicRepository();
const taskRepo = new TaskRepository();
const activityRepo = new ActivityRepository();

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface DailyReportSummary {
  created: number;
  statusChanges: number;
  completed: number;
  testRuns: number;
}

export interface DailyReport {
  date: string;
  project_id: string;
  summary: DailyReportSummary;
  recentEvents: ActivityLog[];
}

export interface BottleneckTask {
  task: Task;
  staleDays: number;
}

export interface BlockedTaskInfo {
  task: Task;
  blockedBy: string | null;
}

export interface BottleneckAnalysis {
  project_id: string;
  staleTasks: BottleneckTask[];
  blockedTasks: BlockedTaskInfo[];
  highPriorityBlocked: Task[];
  longestDependencyChain: Task[];
}

export interface DailyCompletion {
  date: string;
  count: number;
}

export interface EpicProgress {
  epicTitle: string;
  total: number;
  completed: number;
  rate: number;
}

export interface VelocityReport {
  project_id: string;
  dailyCompletions: DailyCompletion[];
  avgPerDay: number;
  epicProgress: EpicProgress[];
  overallRate: number;
}

// ---------------------------------------------------------------------------
// AnalysisService
// ---------------------------------------------------------------------------

export class AnalysisService {
  // -------------------------------------------------------------------------
  // dailyReport
  // -------------------------------------------------------------------------
  async dailyReport(projectId: string): Promise<DailyReport> {
    const project = await projectRepo.findById(projectId);
    if (!project) { console.error(`[AnalysisService] Project not found: ${projectId}`); throw new Error('프로젝트를 찾을 수 없습니다'); }

    // Today's date string in UTC (YYYY-MM-DD)
    const todayStr = new Date().toISOString().slice(0, 10);

    // Collect all task IDs belonging to this project
    const allTasks = await taskRepo.findAll({ project_id: projectId });
    const taskIdSet = new Set(allTasks.map((t) => t.id));

    // Query activity_log for today's events filtered to this project's tasks
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM activity_log WHERE created_at::date = $1 ORDER BY created_at DESC',
      [todayStr]
    );

    // Deserialize payload and filter to project tasks (or project-level events with no task)
    const todayEvents: ActivityLog[] = (rows as ActivityLog[])
      .map((row) => ({
        ...row,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      }))
      .filter((row) => row.task_id == null || taskIdSet.has(row.task_id));

    // Aggregate
    const summary: DailyReportSummary = {
      created: 0,
      statusChanges: 0,
      completed: 0,
      testRuns: 0,
    };

    for (const event of todayEvents) {
      if (event.action === 'create') summary.created++;
      if (event.action === 'status_change') {
        summary.statusChanges++;
        const payload = event.payload as Record<string, unknown> | null;
        if (payload && payload['to'] === 'done') summary.completed++;
      }
      if (event.action === 'test_run') summary.testRuns++;
    }

    // Most recent 10 events
    const recentEvents = todayEvents.slice(0, 10);

    return {
      date: todayStr,
      project_id: projectId,
      summary,
      recentEvents,
    };
  }

  // -------------------------------------------------------------------------
  // bottleneck
  // -------------------------------------------------------------------------
  async bottleneck(projectId: string): Promise<BottleneckAnalysis> {
    const project = await projectRepo.findById(projectId);
    if (!project) { console.error(`[AnalysisService] Project not found: ${projectId}`); throw new Error('프로젝트를 찾을 수 없습니다'); }

    const allTasks = await taskRepo.findAll({ project_id: projectId });
    const now = new Date();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    // staleTasks: in_progress and created_at >= 3 days ago
    const staleTasks: BottleneckTask[] = allTasks
      .filter((t) => t.status === 'in_progress')
      .map((t) => {
        const createdAt = new Date(t.created_at);
        const staleDays = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
        return { task: t, staleDays };
      })
      .filter((item) => item.staleDays >= 3)
      .sort((a, b) => b.staleDays - a.staleDays);

    // blockedTasks: status === 'blocked'
    const blockedTasks: BlockedTaskInfo[] = allTasks
      .filter((t) => t.status === 'blocked')
      .map((t) => ({ task: t, blockedBy: t.blocked_by }));

    // highPriorityBlocked: priority <= 2 and blocked
    const highPriorityBlocked: Task[] = blockedTasks
      .filter((b) => b.task.priority <= 2)
      .map((b) => b.task);

    // longestDependencyChain: find task whose dependency chain is longest (BFS, max depth 5)
    const longestChain = await this._findLongestDependencyChain(allTasks);

    return {
      project_id: projectId,
      staleTasks,
      blockedTasks,
      highPriorityBlocked,
      longestDependencyChain: longestChain,
    };
  }

  private async _findLongestDependencyChain(allTasks: Task[]): Promise<Task[]> {
    const taskMap = new Map<string, Task>(allTasks.map((t) => [t.id, t]));
    const MAX_DEPTH = 5;
    let bestChain: Task[] = [];

    // For each task, do a DFS following depends_on links, collect the longest path
    const buildChain = async (taskId: string, visited: Set<string>, depth: number): Promise<Task[]> => {
      if (depth >= MAX_DEPTH || visited.has(taskId)) return [];
      const task = taskMap.get(taskId);
      if (!task) return [];

      visited.add(taskId);
      const deps = await taskRepo.getDependencies(taskId);
      if (deps.length === 0) {
        visited.delete(taskId);
        return [task];
      }

      let longest: Task[] = [];
      for (const dep of deps) {
        const subChain = await buildChain(dep.depends_on, visited, depth + 1);
        if (subChain.length > longest.length) longest = subChain;
      }

      visited.delete(taskId);
      return [task, ...longest];
    };

    for (const task of allTasks) {
      const chain = await buildChain(task.id, new Set<string>(), 0);
      if (chain.length > bestChain.length) bestChain = chain;
    }

    return bestChain;
  }

  // -------------------------------------------------------------------------
  // velocity
  // -------------------------------------------------------------------------
  async velocity(projectId: string): Promise<VelocityReport> {
    const project = await projectRepo.findById(projectId);
    if (!project) { console.error(`[AnalysisService] Project not found: ${projectId}`); throw new Error('프로젝트를 찾을 수 없습니다'); }

    const allTasks = await taskRepo.findAll({ project_id: projectId });

    // Build last-7-days date array (UTC, YYYY-MM-DD)
    const now = new Date();
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().slice(0, 10));
    }
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Daily completions from completed_at
    const completionCountByDate: Record<string, number> = {};
    for (const date of dates) completionCountByDate[date] = 0;

    for (const task of allTasks) {
      if (task.status === 'done' && task.completed_at) {
        const completedDate = task.completed_at.slice(0, 10);
        if (completionCountByDate[completedDate] !== undefined) {
          completionCountByDate[completedDate]++;
        }
      }
    }

    const dailyCompletions: DailyCompletion[] = dates.map((date) => ({
      date,
      count: completionCountByDate[date],
    }));

    const totalInPeriod = dailyCompletions.reduce((sum, d) => sum + d.count, 0);
    const avgPerDay = Math.round((totalInPeriod / 7) * 100) / 100;

    // Epic-level progress
    const epics = await epicRepo.findByProject(projectId);
    const epicProgress: EpicProgress[] = epics.map((epic) => {
      const epicTasks = allTasks.filter((t) => t.epic_id === epic.id);
      const completed = epicTasks.filter((t) => t.status === 'done').length;
      const total = epicTasks.length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { epicTitle: epic.title, total, completed, rate };
    });

    // Overall rate
    const totalTasks = allTasks.length;
    const totalCompleted = allTasks.filter((t) => t.status === 'done').length;
    const overallRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

    return {
      project_id: projectId,
      dailyCompletions,
      avgPerDay,
      epicProgress,
      overallRate,
    };
  }
}
