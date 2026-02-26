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

runMigrations();

const projectService = new ProjectService();
const taskService = new TaskService();
const contextService = new ContextService();
const testService = new TestService();
const githubService = new GitHubService();
const activityRepo = new ActivityRepository();

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

// Helper: wrap sync handlers
function wrapSync(fn: (req: express.Request) => unknown) {
  return (req: express.Request, res: express.Response) => {
    try {
      const result = fn(req);
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(getErrorStatus(msg)).json({ error: msg });
    }
  };
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
app.get('/api/projects', wrapSync(() => ({ projects: projectService.getAll() })));

app.post('/api/projects', wrapSync((req) => projectService.create(req.body)));

app.get('/api/projects/:id', wrapSync((req) => {
  const project = projectService.getById(req.params.id as string);
  if (!project) throw new Error(`프로젝트를 찾을 수 없습니다: ${req.params.id as string}`);
  const epics = projectService.getEpics(project.id);
  return { project, epics };
}));

app.get('/api/projects/:id/status', wrapSync((req) => contextService.getProjectStatus(req.params.id as string)));

app.get('/api/projects/:id/context', wrapSync((req) => contextService.getSessionContext(req.params.id as string)));

app.get('/api/projects/:id/blocking', wrapSync((req) => contextService.getBlockingAnalysis(req.params.id as string)));

// === Epic routes ===
app.post('/api/projects/:id/epics', wrapSync((req) =>
  projectService.createEpic({ project_id: req.params.id as string, ...req.body })
));

// === Task routes ===
app.get('/api/tasks', wrapSync((req) => ({
  tasks: taskService.getAll({
    project_id: req.query.project_id as string | undefined,
    epic_id: req.query.epic_id as string | undefined,
    status: req.query.status as string | undefined,
    assignee: req.query.assignee as string | undefined,
  }),
})));

app.post('/api/tasks', wrapSync((req) => taskService.create({ ...req.body, created_by: 'human' })));

app.get('/api/tasks/:id', wrapSync((req) => {
  const task = taskService.getById(req.params.id as string);
  if (!task) throw new Error(`태스크를 찾을 수 없습니다: ${req.params.id as string}`);
  const subtasks = taskService.getSubtasks(task.id);
  return { task, subtasks };
}));

app.patch('/api/tasks/:id/status', wrapSync((req) =>
  taskService.updateStatus(req.params.id as string, req.body.status, req.body.notes)
));

app.patch('/api/tasks/:id/priority', wrapSync((req) =>
  taskService.setPriority(req.params.id as string, req.body.priority, req.body.reason)
));

app.post('/api/tasks/:id/decompose', wrapSync((req) =>
  taskService.decompose(req.params.id as string, req.body.subtasks)
));

app.post('/api/tasks/:id/dependencies', wrapSync((req) =>
  taskService.addDependency(req.params.id as string, req.body.depends_on_id)
));

// === Test & Fix routes ===
app.get('/api/tasks/:id/fix-history', wrapSync((req) =>
  testService.getFixHistory(req.params.id as string)
));

app.post('/api/tasks/:id/test-runs', wrapSync((req) =>
  testService.runTests(req.params.id as string, req.body.results)
));

app.post('/api/tasks/:id/test-result', wrapSync((req) =>
  testService.reportTestResult(req.params.id as string, req.body.result, req.body.failures)
));

// === GitHub routes ===
app.post('/api/tasks/:id/link-pr', wrapSync((req) =>
  githubService.linkPrToTask(req.params.id as string, req.body.pr_url)
));

app.get('/api/tasks/:id/pr-status', wrapAsync((req) =>
  githubService.getPrStatus(req.params.id as string)
));

// === Activity routes ===
app.get('/api/activities', wrapSync((req) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const filters: { actor?: string; task_id?: string } = {};
  if (req.query.task_id) filters.task_id = req.query.task_id as string;
  if (req.query.actor) filters.actor = req.query.actor as string;
  return { activities: activityRepo.findRecent(limit, filters) };
}));

app.get('/api/projects/:id/activities', wrapSync((req) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const projectId = req.params.id as string;
  const tasks = taskService.getAll({ project_id: projectId });
  const taskIds = tasks.map(t => t.id);
  if (taskIds.length === 0) return { activities: [] };
  const allActivities = taskIds.flatMap(tid => activityRepo.findByTask(tid, limit));
  allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { activities: allActivities.slice(0, limit) };
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
});
