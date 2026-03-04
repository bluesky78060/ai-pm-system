import { TaskRepository } from '../db/repositories/task-repo.js';
import type { Task } from '../types/index.js';

const taskRepo = new TaskRepository();

// Return types
export interface WorkloadByAssignee {
  assignee: string;
  in_progress_count: number;
  estimated_hours_total: number;
  completed_count: number;
  completion_rate: number;
  tasks_in_progress: Task[];
}

export interface WorkloadAnalysis {
  project_id: string;
  total_active_tasks: number;
  overloaded_assignees: WorkloadByAssignee[];
  all_assignees: WorkloadByAssignee[];
  metrics: {
    avg_workload: number;
    max_workload: number;
    min_workload: number;
    overload_threshold: number;
  };
}

// Workload threshold: consider overloaded if > 3 in_progress tasks or > 20 estimated hours
const OVERLOAD_TASK_COUNT_THRESHOLD = 3;
const OVERLOAD_HOURS_THRESHOLD = 20;

export class WorkloadService {
  async getWorkloadByAssignee(projectId: string): Promise<WorkloadAnalysis> {
    const allTasks = await taskRepo.findAll({ project_id: projectId });

    // Filter to in_progress or completed tasks
    const activeTasks = allTasks.filter(
      (t) => t.status === 'in_progress' || t.status === 'done'
    );

    // Group by assignee
    const assigneeMap = new Map<string, { in_progress: Task[]; completed: Task[] }>();

    for (const task of activeTasks) {
      const assignee = task.assignee || 'unassigned';
      if (!assigneeMap.has(assignee)) {
        assigneeMap.set(assignee, { in_progress: [], completed: [] });
      }
      const group = assigneeMap.get(assignee)!;
      if (task.status === 'in_progress') {
        group.in_progress.push(task);
      } else {
        group.completed.push(task);
      }
    }

    // Calculate stats for each assignee
    const allAssignees: WorkloadByAssignee[] = [];
    for (const [assignee, tasks] of assigneeMap) {
      const inProgressTasks = tasks.in_progress;
      const completedTasks = tasks.completed;
      const estimatedHours = inProgressTasks.reduce(
        (sum, t) => sum + (t.estimated_hrs || 0),
        0
      );

      allAssignees.push({
        assignee,
        in_progress_count: inProgressTasks.length,
        estimated_hours_total: estimatedHours,
        completed_count: completedTasks.length,
        completion_rate: completedTasks.length / (inProgressTasks.length + completedTasks.length),
        tasks_in_progress: inProgressTasks,
      });
    }

    // Sort by workload (in_progress count first, then hours)
    allAssignees.sort((a, b) => {
      if (a.in_progress_count !== b.in_progress_count) {
        return b.in_progress_count - a.in_progress_count;
      }
      return b.estimated_hours_total - a.estimated_hours_total;
    });

    // Find overloaded assignees
    const overloadedAssignees = allAssignees.filter(
      (a) =>
        a.in_progress_count > OVERLOAD_TASK_COUNT_THRESHOLD ||
        a.estimated_hours_total > OVERLOAD_HOURS_THRESHOLD
    );

    // Calculate metrics
    const workloads = allAssignees.map((a) => a.in_progress_count);
    const avgWorkload = workloads.length > 0 ? workloads.reduce((a, b) => a + b) / workloads.length : 0;
    const maxWorkload = workloads.length > 0 ? Math.max(...workloads) : 0;
    const minWorkload = workloads.length > 0 ? Math.min(...workloads) : 0;

    return {
      project_id: projectId,
      total_active_tasks: allTasks.filter((t) => t.status === 'in_progress').length,
      overloaded_assignees: overloadedAssignees,
      all_assignees: allAssignees,
      metrics: {
        avg_workload: Math.round(avgWorkload * 100) / 100,
        max_workload: maxWorkload,
        min_workload: minWorkload,
        overload_threshold: OVERLOAD_TASK_COUNT_THRESHOLD,
      },
    };
  }

  async getOverloadAlerts(projectId: string): Promise<{
    overloaded_count: number;
    alerts: {
      assignee: string;
      reason: string;
      current_load: string;
      recommended_action: string;
    }[];
  }> {
    const analysis = await this.getWorkloadByAssignee(projectId);

    const alerts = analysis.overloaded_assignees.map((assignee) => {
      const reasons = [];
      if (assignee.in_progress_count > OVERLOAD_TASK_COUNT_THRESHOLD) {
        reasons.push(`${assignee.in_progress_count} tasks in progress`);
      }
      if (assignee.estimated_hours_total > OVERLOAD_HOURS_THRESHOLD) {
        reasons.push(`${assignee.estimated_hours_total}h estimated work`);
      }

      const recommendedAction =
        assignee.in_progress_count > OVERLOAD_TASK_COUNT_THRESHOLD
          ? `Consider reassigning some tasks from ${assignee.assignee}'s in-progress queue`
          : `Review estimated hours for ${assignee.assignee}'s tasks`;

      return {
        assignee: assignee.assignee,
        reason: reasons.join(', '),
        current_load: `${assignee.in_progress_count} tasks, ${assignee.estimated_hours_total}h`,
        recommended_action: recommendedAction,
      };
    });

    return {
      overloaded_count: alerts.length,
      alerts,
    };
  }
}
