import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
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

await runMigrations();

// Seed: 배포판에서 DB가 비어있으면 기본 프로젝트 데이터 생성
async function seedIfEmpty() {
  const ps = new ProjectService();
  const existing = await ps.getAll();
  if (existing.length > 0) return;

  console.log('[Seed] Empty DB detected, creating default project...');
  const project = await ps.create({
    name: 'AI PM System',
    description: 'MCP 기반 AI 자율 개발 프로젝트 관리 시스템',
    github_repo: 'leechanhee/ai-pm-system',
  });

  const epics = [
    { title: 'MCP 서버 Core', description: '기본 MCP 도구 및 데이터 레이어', priority: 1 },
    { title: 'AI 세션 컨텍스트', description: '세션 시작 시 컨텍스트 제공', priority: 2 },
    { title: 'Web Dashboard', description: 'React 기반 웹 대시보드', priority: 3 },
    { title: '인 프로세스 서브에이전트', description: 'MCP 서버 내 자동화 서브에이전트', priority: 1 },
  ];

  for (const epic of epics) {
    await ps.createEpic({ project_id: project.id, ...epic });
  }

  console.log(`[Seed] Project "${project.name}" (${project.code}) created with ${epics.length} epics`);
}

await seedIfEmpty();

const projectService = new ProjectService();
const taskService = new TaskService();
const contextService = new ContextService();
const testService = new TestService();
const githubService = new GitHubService();
const activityRepo = new ActivityRepository();
const workflowService = new WorkflowService();
const analysisService = new AnalysisService();
const automationService = new AutomationService();

const app = express();
app.use(cors());
app.use(express.json());

// Helper: map error message to HTTP status code
function getErrorStatus(msg: string): number {
  const lower = msg.toLowerCase();
  if (lower.includes('not found') || lower.includes('없')) return 404;
  if (lower.includes('circular') || lower.includes('already') || lower.includes('duplicate')) return 409;
  if (lower.includes('invalid') || lower.includes('must') || lower.includes('required') || lower.includes('cannot')) return 422;
  return 400;
}

// Helper: wrap async handlers
function wrapAsync(fn: (req: express.Request) => Promise<unknown>) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const result = await fn(req);
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(getErrorStatus(msg)).json({ error: msg });
    }
  };
}

// === Project routes ===
app.get('/api/projects', wrapAsync(async () => ({ projects: await projectService.getAll() })));

app.post('/api/projects', wrapAsync(async (req) => projectService.create(req.body)));

app.get('/api/projects/:id', wrapAsync(async (req) => {
  const project = await projectService.getById(req.params.id as string);
  if (!project) throw new Error(`프로젝트를 찾을 수 없습니다: ${req.params.id as string}`);
  const epics = await projectService.getEpics(project.id);
  return { project, epics };
}));

app.get('/api/projects/:id/status', wrapAsync(async (req) => contextService.getProjectStatus(req.params.id as string)));

app.get('/api/projects/:id/context', wrapAsync(async (req) => contextService.getSessionContext(req.params.id as string)));

app.get('/api/projects/:id/blocking', wrapAsync(async (req) => contextService.getBlockingAnalysis(req.params.id as string)));

// === Epic routes ===
app.post('/api/projects/:id/epics', wrapAsync(async (req) =>
  projectService.createEpic({ project_id: req.params.id as string, ...req.body })
));

// === Task routes ===
app.get('/api/tasks', wrapAsync(async (req) => ({
  tasks: await taskService.getAll({
    project_id: req.query.project_id as string | undefined,
    epic_id: req.query.epic_id as string | undefined,
    status: req.query.status as string | undefined,
    assignee: req.query.assignee as string | undefined,
  }),
})));

app.post('/api/tasks', wrapAsync(async (req) => taskService.create({ ...req.body, created_by: 'human' })));

app.get('/api/tasks/:id', wrapAsync(async (req) => {
  const task = await taskService.getById(req.params.id as string);
  if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${req.params.id as string}`);
  const subtasks = await taskService.getSubtasks(task.id);
  return { task, subtasks };
}));

app.patch('/api/tasks/:id/status', wrapAsync(async (req) =>
  taskService.updateStatus(req.params.id as string, req.body.status, req.body.notes)
));

app.patch('/api/tasks/:id/priority', wrapAsync(async (req) =>
  taskService.setPriority(req.params.id as string, req.body.priority, req.body.reason)
));

app.patch('/api/tasks/:id', wrapAsync(async (req) => {
  const task = await taskService.getById(req.params.id as string);
  if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${req.params.id as string}`);
  return taskService.update(req.params.id as string, req.body);
}));

app.post('/api/tasks/:id/decompose', wrapAsync(async (req) =>
  taskService.decompose(req.params.id as string, req.body.subtasks)
));

app.post('/api/tasks/:id/dependencies', wrapAsync(async (req) =>
  taskService.addDependency(req.params.id as string, req.body.depends_on_id)
));

// === Test & Fix routes ===
app.get('/api/tasks/:id/fix-history', wrapAsync(async (req) =>
  testService.getFixHistory(req.params.id as string)
));

app.post('/api/tasks/:id/test-runs', wrapAsync(async (req) =>
  testService.runTests(req.params.id as string, req.body.results)
));

app.post('/api/tasks/:id/test-result', wrapAsync(async (req) =>
  testService.reportTestResult(req.params.id as string, req.body.result, req.body.failures)
));

// === GitHub routes ===
app.post('/api/tasks/:id/link-pr', wrapAsync(async (req) =>
  githubService.linkPrToTask(req.params.id as string, req.body.pr_url)
));

app.get('/api/tasks/:id/pr-status', wrapAsync((req) =>
  githubService.getPrStatus(req.params.id as string)
));

// === Activity routes ===
app.get('/api/activities', wrapAsync(async (req) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const filters: { actor?: string; task_id?: string } = {};
  if (req.query.task_id) filters.task_id = req.query.task_id as string;
  if (req.query.actor) filters.actor = req.query.actor as string;
  return { activities: await activityRepo.findRecent(limit, filters) };
}));

app.get('/api/projects/:id/activities', wrapAsync(async (req) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const projectId = req.params.id as string;
  const tasks = await taskService.getAll({ project_id: projectId });
  const taskIds = tasks.map(t => t.id);
  if (taskIds.length === 0) return { activities: [] };
  const allActivities = (await Promise.all(taskIds.map(tid => activityRepo.findByTask(tid, limit)))).flat();
  allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { activities: allActivities.slice(0, limit) };
}));

// === Workflow routes ===
app.post('/api/workflow/:taskId', wrapAsync(async (req) => {
  const { action, test_results, notes } = req.body;
  switch (action) {
    case 'start_work': return workflowService.startWork(req.params.taskId as string);
    case 'submit_test': return workflowService.submitTest(req.params.taskId as string, test_results);
    case 'complete_fix': return workflowService.completeFix(req.params.taskId as string, notes);
    case 'approve_review': return workflowService.approveReview(req.params.taskId as string, notes);
    default: throw new Error(`알 수 없는 워크플로우 액션: ${action}`);
  }
}));

// === Analysis routes ===
app.get('/api/projects/:id/analysis/:type', wrapAsync(async (req) => {
  const type = req.params.type as string;
  switch (type) {
    case 'daily_report': return analysisService.dailyReport(req.params.id as string);
    case 'bottleneck': return analysisService.bottleneck(req.params.id as string);
    case 'velocity': return analysisService.velocity(req.params.id as string);
    default: throw new Error(`알 수 없는 분석 타입: ${type}`);
  }
}));

// === Automation routes ===
app.get('/api/projects/:id/automation', wrapAsync(async (req) => ({
  rules: await automationService.listRules(req.params.id as string),
})));

app.post('/api/projects/:id/automation', wrapAsync(async (req) =>
  automationService.createRule(
    req.params.id as string,
    req.body.name,
    req.body.trigger_event,
    req.body.action_type,
    req.body.condition,
    req.body.action_config,
  )
));

app.delete('/api/automation/:ruleId', wrapAsync(async (req) => {
  await automationService.deleteRule(req.params.ruleId as string);
  return { message: '규칙 삭제 완료' };
}));

app.patch('/api/automation/:ruleId/toggle', wrapAsync(async (req) =>
  automationService.toggleRule(req.params.ruleId as string)
));

// === Seed demo activities for a task ===
app.post('/api/tasks/:id/seed-activities', wrapAsync(async (req) => {
  const taskId = req.params.id as string;
  const task = await taskService.getById(taskId);
  if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${taskId}`);

  // Check existing activities to avoid duplicates
  const existing = await activityRepo.findByTask(taskId, 1);
  const hasSeed = existing.some((a: { action: string }) => a.action === 'ai_analysis');
  if (hasSeed) return { message: '이미 데모 데이터가 존재합니다', taskId };

  // Base time: task creation time
  const base = new Date(task.created_at).getTime();
  const min = (m: number) => new Date(base + m * 60000).toISOString();

  const activities = req.body.activities as {
    actor: 'ai' | 'human' | 'github' | 'system';
    action: string;
    payload: Record<string, unknown>;
    offset_min: number;
  }[];

  if (!activities || !Array.isArray(activities)) {
    throw new Error('activities 배열이 필요합니다');
  }

  const inserted = [];
  for (const a of activities) {
    const pool = (await import('./db/connection.js')).getPool();
    const { rows } = await pool.query(
      'INSERT INTO activity_log (task_id, actor, action, payload, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [taskId, a.actor, a.action, JSON.stringify(a.payload), min(a.offset_min)]
    );
    inserted.push(rows[0]);
  }

  return { message: `${inserted.length}개 활동 로그 삽입 완료`, taskId };
}));

// Serve static files (Web UI)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticPath = process.env.STATIC_PATH ?? path.join(__dirname, '../../web-ui/dist');
app.use(express.static(staticPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Start server
const PORT = process.env.PORT ?? process.env.API_PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`AI PM API Server running on http://localhost:${PORT}`);

  // Keep-alive: Render 무료 티어 슬립 방지 (10분 간격)
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    const INTERVAL = 10 * 60 * 1000;
    setInterval(() => {
      fetch(`${RENDER_URL}/api/projects`).catch(() => {});
    }, INTERVAL);
    console.log(`[Keep-alive] Pinging ${RENDER_URL} every 10 minutes`);
  }
});
