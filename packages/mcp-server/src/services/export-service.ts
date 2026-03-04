import { v4 as uuid } from 'uuid';
import { ProjectRepository } from '../db/repositories/project-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { TaskRepository } from '../db/repositories/task-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { TestRunRepository } from '../db/repositories/test-run-repo.js';
import { FixAttemptRepository } from '../db/repositories/fix-attempt-repo.js';
import { UUID_REGEX } from '../utils/code-gen.js';
import { getPool } from '../db/connection.js';
import type { ExportData, ImportResult, Project, Epic, Task, TaskDependency, ActivityLog, TestRun, FixAttempt } from '../types/entities.js';

const projectRepo = new ProjectRepository();
const epicRepo = new EpicRepository();
const taskRepo = new TaskRepository();
const activityRepo = new ActivityRepository();
const testRunRepo = new TestRunRepository();
const fixAttemptRepo = new FixAttemptRepository();

export class ExportService {
  private convertToCSV(rows: any[]): string {
    if (rows.length === 0) return '';

    const keys = Object.keys(rows[0]);
    const header = keys.join(',');

    const dataRows = rows.map(row => {
      return keys.map(key => {
        const value = row[key];
        if (value === null || value === undefined) return '';
        const strValue = String(value);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      }).join(',');
    });

    return [header, ...dataRows].join('\n');
  }

  async exportProject(projectIdOrCode: string, format: 'json' | 'csv'): Promise<ExportData | { format: 'csv'; data: Record<string, string> }> {
    // Resolve project
    let project: Project | undefined;
    if (UUID_REGEX.test(projectIdOrCode)) {
      project = await projectRepo.findById(projectIdOrCode);
    } else {
      project = await projectRepo.findByCode(projectIdOrCode);
    }

    if (!project) {
      throw new Error(`프로젝트를 찾을 수 없습니다: ${projectIdOrCode}`);
    }

    // Fetch all related data
    const epics = await epicRepo.findByProject(project.id);
    const tasks = await taskRepo.findAll({ project_id: project.id });

    // Batch fetch all task-related data in parallel
    const taskIds = tasks.map(t => t.id);
    const [dependencies, activities, testRuns, fixAttempts] = await Promise.all([
      taskRepo.getDependenciesBatch(taskIds),
      activityRepo.findByTasks(taskIds),
      testRunRepo.findByTasks(taskIds),
      fixAttemptRepo.findByTasks(taskIds),
    ]);

    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      format,
      project,
      epics,
      tasks,
      dependencies,
      activities,
      testRuns,
      fixAttempts,
    };

    if (format === 'json') {
      return exportData;
    }

    // CSV format
    return {
      format: 'csv',
      data: {
        project: this.convertToCSV([project]),
        epics: this.convertToCSV(epics),
        tasks: this.convertToCSV(tasks),
        dependencies: this.convertToCSV(dependencies),
        activities: this.convertToCSV(activities),
        testRuns: this.convertToCSV(testRuns),
        fixAttempts: this.convertToCSV(fixAttempts),
      },
    };
  }

  async importProject(data: ExportData, options?: { overwrite?: boolean }): Promise<ImportResult> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Check if project code exists
      const existingProject = data.project.code ? await projectRepo.findByCode(data.project.code) : undefined;

      if (existingProject) {
        if (!options?.overwrite) {
          throw new Error(`프로젝트 코드 '${data.project.code}'가 이미 존재합니다. overwrite 옵션을 사용하세요.`);
        }

        // Delete existing project (CASCADE will delete related records)
        await client.query('DELETE FROM projects WHERE id = $1', [existingProject.id]);
      }

      // Create UUID mappings
      const projectIdMap = new Map<string, string>();
      const epicIdMap = new Map<string, string>();
      const taskIdMap = new Map<string, string>();
      const activityIdMap = new Map<string, string>();
      const testRunIdMap = new Map<string, string>();
      const fixAttemptIdMap = new Map<string, string>();

      // Generate new IDs
      const newProjectId = uuid();
      projectIdMap.set(data.project.id, newProjectId);

      for (const epic of data.epics) {
        epicIdMap.set(epic.id, uuid());
      }

      for (const task of data.tasks) {
        taskIdMap.set(task.id, uuid());
      }

      for (const activity of data.activities) {
        activityIdMap.set(String(activity.id), uuid());
      }

      for (const testRun of data.testRuns) {
        testRunIdMap.set(testRun.id, uuid());
      }

      for (const fixAttempt of data.fixAttempts) {
        fixAttemptIdMap.set(fixAttempt.id, uuid());
      }

      // Insert project
      await client.query(
        `INSERT INTO projects (id, code, name, description, status, github_repo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newProjectId,
          data.project.code,
          data.project.name,
          data.project.description,
          data.project.status,
          data.project.github_repo,
          data.project.created_at,
          data.project.updated_at,
        ]
      );

      // Insert epics
      for (const epic of data.epics) {
        await client.query(
          `INSERT INTO epics (id, project_id, title, description, status, priority, order_index, seq, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            epicIdMap.get(epic.id),
            newProjectId,
            epic.title,
            epic.description,
            epic.status,
            epic.priority,
            epic.order_index,
            epic.seq,
            epic.created_at,
          ]
        );
      }

      // Insert tasks
      for (const task of data.tasks) {
        await client.query(
          `INSERT INTO tasks (id, epic_id, parent_id, title, description, status, priority, assignee,
                             github_issue, github_pr, estimated_hrs, actual_hrs, blocked_by, created_by,
                             seq, ticket_code, created_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            taskIdMap.get(task.id),
            task.epic_id ? epicIdMap.get(task.epic_id) : null,
            task.parent_id ? taskIdMap.get(task.parent_id) : null,
            task.title,
            task.description,
            task.status,
            task.priority,
            task.assignee,
            task.github_issue,
            task.github_pr,
            task.estimated_hrs,
            task.actual_hrs,
            task.blocked_by,
            task.created_by,
            task.seq,
            task.ticket_code,
            task.created_at,
            task.completed_at,
          ]
        );
      }

      // Insert dependencies
      for (const dep of data.dependencies) {
        await client.query(
          `INSERT INTO task_dependencies (task_id, depends_on)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [taskIdMap.get(dep.task_id), taskIdMap.get(dep.depends_on)]
        );
      }

      // Insert activities
      for (const activity of data.activities) {
        await client.query(
          `INSERT INTO activity_log (task_id, actor, action, payload, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            activity.task_id ? taskIdMap.get(activity.task_id) : null,
            activity.actor,
            activity.action,
            activity.payload,
            activity.created_at,
          ]
        );
      }

      // Insert test runs
      for (const testRun of data.testRuns) {
        await client.query(
          `INSERT INTO test_runs (id, task_id, run_number, test_type, status, output, failures, duration_ms, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            testRunIdMap.get(testRun.id),
            taskIdMap.get(testRun.task_id),
            testRun.run_number,
            testRun.test_type,
            testRun.status,
            testRun.output,
            testRun.failures,
            testRun.duration_ms,
            testRun.created_at,
          ]
        );
      }

      // Insert fix attempts
      for (const fixAttempt of data.fixAttempts) {
        await client.query(
          `INSERT INTO fix_attempts (id, task_id, attempt_number, trigger_run_id, files_changed,
                                      fix_description, result_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            fixAttemptIdMap.get(fixAttempt.id),
            taskIdMap.get(fixAttempt.task_id),
            fixAttempt.attempt_number,
            fixAttempt.trigger_run_id ? testRunIdMap.get(fixAttempt.trigger_run_id) : null,
            fixAttempt.files_changed,
            fixAttempt.fix_description,
            fixAttempt.result_status,
            fixAttempt.created_at,
          ]
        );
      }

      // Commit transaction
      await client.query('COMMIT');

      return {
        projectId: newProjectId,
        projectCode: data.project.code || '',
        epicCount: data.epics.length,
        taskCount: data.tasks.length,
        activityCount: data.activities.length,
      };
    } catch (err) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
