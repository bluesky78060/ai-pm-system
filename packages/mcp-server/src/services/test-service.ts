import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { FixAttemptRepository } from '../db/repositories/fix-attempt-repo.js';
import { TaskRepository } from '../db/repositories/task-repo.js';
import { TestRunRepository } from '../db/repositories/test-run-repo.js';
import type { FixAttempt, Task, TestRun } from '../types/index.js';

const testRunRepo = new TestRunRepository();
const fixAttemptRepo = new FixAttemptRepository();
const taskRepo = new TaskRepository();
const activityRepo = new ActivityRepository();

const MAX_FIX_ATTEMPTS = 3;

export class TestService {
	/**
	 * run_tests: Record test execution results for a task.
	 * Increments run_number automatically. Creates TestRun records for each test type.
	 */
	async runTests(
		taskId: string,
		results: {
			test_type: string;
			status: string;
			output?: string;
			failures?: string;
			duration_ms?: number;
		}[],
	): Promise<{
		runNumber: number;
		results: TestRun[];
		summary: { pass: number; fail: number; skip: number };
		message: string;
	}> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[TestService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const runNumber = (await testRunRepo.getLatestRunNumber(taskId)) + 1;
		const created: TestRun[] = [];
		const summary = { pass: 0, fail: 0, skip: 0 };

		for (const r of results) {
			const testRun = await testRunRepo.create({
				task_id: taskId,
				run_number: runNumber,
				test_type: r.test_type,
				status: r.status,
				output: r.output,
				failures: r.failures,
				duration_ms: r.duration_ms,
			});
			created.push(testRun);
			if (r.status === 'pass') summary.pass++;
			else if (r.status === 'fail') summary.fail++;
			else summary.skip++;
		}

		await activityRepo.create({
			task_id: taskId,
			actor: 'ai',
			action: 'test_run',
			payload: {
				runNumber,
				summary,
				results: results.map((r) => ({
					name: r.test_type,
					status: r.status,
					duration_ms: r.duration_ms,
					error: r.failures,
				})),
			},
		});

		return {
			runNumber,
			results: created,
			summary,
			message: `테스트 실행 #${runNumber}: ${summary.pass}개 통과, ${summary.fail}개 실패, ${summary.skip}개 스킵`,
		};
	}

	/**
	 * report_test_result: Report overall test result and transition task status accordingly.
	 * - If all pass: task status -> review
	 * - If any fail: task status -> fixing (if attempts < MAX) or blocked (if escalated)
	 */
	async reportTestResult(
		taskId: string,
		overallStatus: 'pass' | 'fail',
		failureDetails?: { file?: string; line?: number; message: string }[],
	): Promise<{ task: Task; action: string; message: string }> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[TestService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		if (overallStatus === 'pass') {
			// Move to review
			const updated = await taskRepo.updateStatus(taskId, 'review', '모든 테스트 통과');
			await activityRepo.create({
				task_id: taskId,
				actor: 'ai',
				action: 'status_change',
				payload: { from: task.status, to: 'review', reason: '모든 테스트 통과' },
			});
			return {
				task: updated,
				action: 'moved_to_review',
				message: `'${task.title}' 모든 테스트 통과 → review 상태로 전환`,
			};
		}

		// Fail case: check fix attempt count
		const currentAttempts = await fixAttemptRepo.getLatestAttemptNumber(taskId);

		if (currentAttempts >= MAX_FIX_ATTEMPTS) {
			// Escalate
			const updated = await taskRepo.updateStatus(
				taskId,
				'blocked',
				`${MAX_FIX_ATTEMPTS}회 수정 시도 후에도 테스트 실패 - 에스컬레이션`,
			);
			await activityRepo.create({
				task_id: taskId,
				actor: 'ai',
				action: 'escalate',
				payload: { attempts: currentAttempts, failures: failureDetails },
			});
			return {
				task: updated,
				action: 'escalated',
				message: `'${task.title}' ${MAX_FIX_ATTEMPTS}회 수정 시도 실패 → 사람에게 에스컬레이션 (blocked)`,
			};
		}

		// Move to fixing
		const updated = await taskRepo.updateStatus(
			taskId,
			'fixing',
			`테스트 실패 - 수정 시도 ${currentAttempts + 1}/${MAX_FIX_ATTEMPTS}`,
		);
		await activityRepo.create({
			task_id: taskId,
			actor: 'ai',
			action: 'status_change',
			payload: {
				from: task.status,
				to: 'fixing',
				failures: failureDetails,
				attemptsPending: currentAttempts + 1,
			},
		});
		return {
			task: updated,
			action: 'moved_to_fixing',
			message: `'${task.title}' 테스트 실패 → fixing 상태 (수정 시도 ${currentAttempts + 1}/${MAX_FIX_ATTEMPTS})`,
		};
	}

	/**
	 * create_fix_task: Create a fix subtask and record fix attempt.
	 */
	async createFixTask(
		parentTaskId: string,
		issueDescription: string,
		filesChanged?: { path: string; diff?: string }[],
	): Promise<{ fixTask: Task; fixAttempt: FixAttempt; message: string }> {
		const parentTask = await taskRepo.findById(parentTaskId);
		if (!parentTask) {
			console.error(`[TestService] Parent task not found: ${parentTaskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const attemptNumber = (await fixAttemptRepo.getLatestAttemptNumber(parentTaskId)) + 1;
		if (attemptNumber > MAX_FIX_ATTEMPTS) {
			throw new Error(
				`최대 수정 횟수(${MAX_FIX_ATTEMPTS})를 초과했습니다. 에스컬레이션이 필요합니다.`,
			);
		}

		// Get latest test run for trigger
		const testRuns = await testRunRepo.findByTask(parentTaskId);
		const latestFailedRun = testRuns.find((r) => r.status === 'fail');

		// Create fix subtask
		const fixTask = await taskRepo.create({
			title: `[Fix #${attemptNumber}] ${issueDescription}`,
			parent_id: parentTaskId,
			epic_id: parentTask.epic_id ?? undefined,
			description: issueDescription,
			priority: 1,
			assignee: 'ai',
			created_by: 'ai',
		});

		// Record fix attempt
		const fixAttempt = await fixAttemptRepo.create({
			task_id: parentTaskId,
			attempt_number: attemptNumber,
			trigger_run_id: latestFailedRun?.id,
			files_changed: filesChanged ? JSON.stringify(filesChanged) : undefined,
			fix_description: issueDescription,
			result_status: 'fail', // starts as fail, updated when tests pass
		});

		await activityRepo.create({
			task_id: parentTaskId,
			actor: 'ai',
			action: 'create_fix',
			payload: {
				attemptNumber,
				fixTaskId: fixTask.id,
				fixAttemptId: fixAttempt.id,
				description: issueDescription,
			},
		});

		return {
			fixTask,
			fixAttempt,
			message: `수정 시도 #${attemptNumber} 생성: ${issueDescription}`,
		};
	}

	/**
	 * get_fix_history: Get all test runs and fix attempts for a task.
	 */
	async getFixHistory(taskId: string): Promise<{
		task: Task;
		testRuns: TestRun[];
		fixAttempts: FixAttempt[];
		summary: { totalRuns: number; totalFixes: number; lastResult: string | null };
	}> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[TestService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const testRuns = await testRunRepo.findByTask(taskId);
		const fixAttempts = await fixAttemptRepo.findByTask(taskId);

		const lastRun = testRuns.length > 0 ? testRuns[0] : null;

		return {
			task,
			testRuns,
			fixAttempts,
			summary: {
				totalRuns: testRuns.length,
				totalFixes: fixAttempts.length,
				lastResult: lastRun?.status ?? null,
			},
		};
	}

	/**
	 * escalate_to_human: Force escalation of a task to human.
	 */
	async escalateToHuman(taskId: string, reason: string): Promise<{ task: Task; message: string }> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[TestService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const attempts = await fixAttemptRepo.getLatestAttemptNumber(taskId);

		const updated = await taskRepo.updateStatus(taskId, 'blocked', `에스컬레이션: ${reason}`);

		await activityRepo.create({
			task_id: taskId,
			actor: 'ai',
			action: 'escalate',
			payload: { reason, fixAttempts: attempts },
		});

		return {
			task: updated,
			message: `'${task.title}' 사람에게 에스컬레이션 완료 (사유: ${reason}, 수정 시도: ${attempts}회)`,
		};
	}
}
