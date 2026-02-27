import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Set in-memory DB before any imports that trigger DB initialization
process.env.DB_PATH = ':memory:';

// Dynamic imports after env setup to ensure the in-memory DB path is used
let TaskService: typeof import('../services/task-service.js').TaskService;
let TestService: typeof import('../services/test-service.js').TestService;
let ProjectRepository: typeof import('../db/repositories/project-repo.js').ProjectRepository;
let EpicRepository: typeof import('../db/repositories/epic-repo.js').EpicRepository;
let FixAttemptRepository: typeof import('../db/repositories/fix-attempt-repo.js').FixAttemptRepository;
let runMigrations: typeof import('../db/migrate.js').runMigrations;
let closeDb: typeof import('../db/connection.js').closeDb;

beforeAll(async () => {
  const migrate = await import('../db/migrate.js');
  const conn = await import('../db/connection.js');
  const taskMod = await import('../services/task-service.js');
  const testMod = await import('../services/test-service.js');
  const projectMod = await import('../db/repositories/project-repo.js');
  const epicMod = await import('../db/repositories/epic-repo.js');
  const fixAttemptMod = await import('../db/repositories/fix-attempt-repo.js');

  runMigrations = migrate.runMigrations;
  closeDb = conn.closeDb;
  TaskService = taskMod.TaskService;
  TestService = testMod.TestService;
  ProjectRepository = projectMod.ProjectRepository;
  EpicRepository = epicMod.EpicRepository;
  FixAttemptRepository = fixAttemptMod.FixAttemptRepository;

  await runMigrations();
});

afterAll(() => {
  closeDb();
});

// Helper: create a project and epic, return their IDs
async function createProjectAndEpic() {
  const projectRepo = new ProjectRepository();
  const epicRepo = new EpicRepository();

  const project = await projectRepo.create({ name: 'Test Project' });
  const epic = await epicRepo.create({ project_id: project.id, title: 'Test Epic' });

  return { projectId: project.id, epicId: epic.id };
}

// ──────────────────────────────────────────────
// TaskService.create
// ──────────────────────────────────────────────
describe('TaskService.create', () => {
  it('creates a task with required title', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();

    const result = await svc.create({ title: 'My Task', epic_id: epicId });

    expect(result.task).toBeDefined();
    expect(result.task.title).toBe('My Task');
    expect(result.task.epic_id).toBe(epicId);
    expect(result.task.status).toBe('todo');
    expect(result.message).toContain('My Task');
  });

  it('creates a task with optional fields', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();

    const result = await svc.create({
      title: 'Task With Options',
      epic_id: epicId,
      description: 'Some description',
      priority: 2,
      assignee: 'alice',
      estimated_hrs: 4,
      created_by: 'human',
    });

    expect(result.task.title).toBe('Task With Options');
    expect(result.task.priority).toBe(2);
    expect(result.task.assignee).toBe('alice');
    expect(result.task.estimated_hrs).toBe(4);
    expect(result.task.created_by).toBe('human');
  });

  it('returns a task without epic when epic_id is omitted', async () => {
    const svc = new TaskService();

    const result = await svc.create({ title: 'Standalone Task' });

    expect(result.task).toBeDefined();
    expect(result.task.title).toBe('Standalone Task');
    expect(result.task.epic_id).toBeNull();
  });
});

// ──────────────────────────────────────────────
// TaskService.updateStatus
// ──────────────────────────────────────────────
describe('TaskService.updateStatus', () => {
  it('transitions todo → in_progress', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 1', epic_id: epicId });

    const result = await svc.updateStatus(task.id, 'in_progress');

    expect(result.previousStatus).toBe('todo');
    expect(result.task.status).toBe('in_progress');
    expect(result.message).toContain('todo');
    expect(result.message).toContain('in_progress');
  });

  it('transitions in_progress → testing', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 2', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');

    const result = await svc.updateStatus(task.id, 'testing');

    expect(result.previousStatus).toBe('in_progress');
    expect(result.task.status).toBe('testing');
  });

  it('transitions testing → done is INVALID and throws', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 3', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');
    await svc.updateStatus(task.id, 'testing');

    await expect(svc.updateStatus(task.id, 'done')).rejects.toThrow();
  });

  it('transitions todo → done is INVALID and throws', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 4', epic_id: epicId });

    await expect(svc.updateStatus(task.id, 'done')).rejects.toThrow(/잘못된 상태 전환/);
  });

  it('transitions testing → review (valid via fixing path)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 5', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');
    await svc.updateStatus(task.id, 'testing');

    const result = await svc.updateStatus(task.id, 'review');

    expect(result.task.status).toBe('review');
  });

  it('transitions review → done', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Status Test 6', epic_id: epicId });
    await svc.updateStatus(task.id, 'in_progress');
    await svc.updateStatus(task.id, 'testing');
    await svc.updateStatus(task.id, 'review');

    const result = await svc.updateStatus(task.id, 'done');

    expect(result.task.status).toBe('done');
  });

  it('throws when task does not exist', async () => {
    const svc = new TaskService();

    await expect(svc.updateStatus('nonexistent-id', 'in_progress')).rejects.toThrow(/태스크를 찾을 수 없습니다/);
  });
});

// ──────────────────────────────────────────────
// TaskService.setPriority
// ──────────────────────────────────────────────
describe('TaskService.setPriority', () => {
  it('sets a valid priority (1)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 1', epic_id: epicId, priority: 3 });

    const result = await svc.setPriority(task.id, 1, 'urgent');

    expect(result.task.priority).toBe(1);
    expect(result.previousPriority).toBe(3);
    expect(result.message).toContain('1');
  });

  it('sets a valid priority (5)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 2', epic_id: epicId, priority: 1 });

    const result = await svc.setPriority(task.id, 5, 'low importance');

    expect(result.task.priority).toBe(5);
    expect(result.previousPriority).toBe(1);
  });

  it('sets a valid priority (3, midpoint)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 3', epic_id: epicId, priority: 1 });

    const result = await svc.setPriority(task.id, 3, 'rebalanced');

    expect(result.task.priority).toBe(3);
  });

  it('throws for priority 0 (below minimum)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 4', epic_id: epicId });

    await expect(svc.setPriority(task.id, 0, 'invalid')).rejects.toThrow(/우선순위는 1~5/);
  });

  it('throws for priority 6 (above maximum)', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 5', epic_id: epicId });

    await expect(svc.setPriority(task.id, 6, 'invalid')).rejects.toThrow(/우선순위는 1~5/);
  });

  it('throws for negative priority', async () => {
    const { epicId } = await createProjectAndEpic();
    const svc = new TaskService();
    const { task } = await svc.create({ title: 'Priority Test 6', epic_id: epicId });

    await expect(svc.setPriority(task.id, -1, 'negative')).rejects.toThrow(/우선순위는 1~5/);
  });

  it('throws when task does not exist', async () => {
    const svc = new TaskService();

    await expect(svc.setPriority('nonexistent-id', 3, 'reason')).rejects.toThrow(/태스크를 찾을 수 없습니다/);
  });
});

// ──────────────────────────────────────────────
// TestService.reportTestResult
// ──────────────────────────────────────────────
describe('TestService.reportTestResult', () => {
  it('pass: sets task status to review', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();

    const { task } = await taskSvc.create({ title: 'Test Result Pass', epic_id: epicId });
    // Move task to testing so that the status change is valid at the repo level
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    const result = await testSvc.reportTestResult(task.id, 'pass');

    expect(result.task.status).toBe('review');
    expect(result.action).toBe('moved_to_review');
    expect(result.message).toContain('review');
  });

  it('fail with 0 prior attempts: sets task status to fixing', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();

    const { task } = await taskSvc.create({ title: 'Test Result Fail 1', epic_id: epicId });
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    const result = await testSvc.reportTestResult(task.id, 'fail', [
      { message: 'assertion failed at line 42' },
    ]);

    expect(result.task.status).toBe('fixing');
    expect(result.action).toBe('moved_to_fixing');
    expect(result.message).toContain('fixing');
  });

  it('fail with 2 prior attempts (< MAX): sets task status to fixing', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();
    const fixRepo = new FixAttemptRepository();

    const { task } = await taskSvc.create({ title: 'Test Result Fail 2', epic_id: epicId });
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    // Insert 2 existing fix attempts manually
    await fixRepo.create({ task_id: task.id, attempt_number: 1, result_status: 'fail' });
    await fixRepo.create({ task_id: task.id, attempt_number: 2, result_status: 'fail' });

    const result = await testSvc.reportTestResult(task.id, 'fail');

    expect(result.task.status).toBe('fixing');
    expect(result.action).toBe('moved_to_fixing');
  });

  it('fail with MAX (3) prior attempts: escalates to blocked', async () => {
    const { epicId } = await createProjectAndEpic();
    const taskSvc = new TaskService();
    const testSvc = new TestService();
    const fixRepo = new FixAttemptRepository();

    const { task } = await taskSvc.create({ title: 'Test Result Fail Escalate', epic_id: epicId });
    await taskSvc.updateStatus(task.id, 'in_progress');
    await taskSvc.updateStatus(task.id, 'testing');

    // Insert 3 existing fix attempts (MAX_FIX_ATTEMPTS = 3)
    await fixRepo.create({ task_id: task.id, attempt_number: 1, result_status: 'fail' });
    await fixRepo.create({ task_id: task.id, attempt_number: 2, result_status: 'fail' });
    await fixRepo.create({ task_id: task.id, attempt_number: 3, result_status: 'fail' });

    const result = await testSvc.reportTestResult(task.id, 'fail');

    expect(result.task.status).toBe('blocked');
    expect(result.action).toBe('escalated');
    expect(result.message).toContain('에스컬레이션');
  });

  it('throws when task does not exist', async () => {
    const testSvc = new TestService();

    await expect(testSvc.reportTestResult('nonexistent-id', 'pass')).rejects.toThrow(/태스크를 찾을 수 없습니다/);
  });
});
