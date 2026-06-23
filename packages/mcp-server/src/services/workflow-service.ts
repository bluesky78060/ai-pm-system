import { v4 as uuid } from 'uuid';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { EpicRepository } from '../db/repositories/epic-repo.js';
import { FixAttemptRepository } from '../db/repositories/fix-attempt-repo.js';
import { ProjectRepository } from '../db/repositories/project-repo.js';
import { TaskRepository } from '../db/repositories/task-repo.js';
import { TestRunRepository } from '../db/repositories/test-run-repo.js';
import type { FixAttempt, Task } from '../types/index.js';
import { ContextService } from './context-service.js';
import { GitHubService } from './github-service.js';
import { TaskService } from './task-service.js';

export interface TestResult {
	test_type: string;
	status: string;
	output?: string;
	failures?: string;
	duration_ms?: number;
}

/**
 * validateStrictResults (APS-1-9): STRICT 모드에서 build+lint+unit 필수 + 모든 항목 status==='pass' 강제.
 * 순수 함수(DB 비의존)로 단위 테스트 가능. isStrict는 호출자가 주입.
 * - 비-strict: 추가 검증 없음 (기존 동작 보존)
 * - strict: 필수 타입 누락 또는 비-pass(skip 포함) 항목이 있으면 throw
 */
export function validateStrictResults(results: TestResult[], isStrict: boolean): void {
	if (!isStrict) return;
	const REQUIRED = ['build', 'lint', 'unit'] as const;
	const present = new Set(results.map((r) => r.test_type));
	const missing = REQUIRED.filter((t) => !present.has(t));
	if (missing.length > 0) {
		throw new Error(
			`STRICT 검증: 필수 타입 누락 [${missing.join(', ')}]. build·lint·unit 모두 제출하고 status=pass여야 합니다.`,
		);
	}
	const notPassed = results.filter((r) => r.status !== 'pass');
	if (notPassed.length > 0) {
		throw new Error(
			`STRICT 검증: 통과하지 않은 항목 [${notPassed.map((r) => `${r.test_type}(${r.status})`).join(', ')}]. 모든 검증이 status=pass여야 합니다 (skip 불가).`,
		);
	}
}

/**
 * parseStrictProjects (APS-1-11): STRICT_SUBMIT_TEST_PROJECTS 플래그 문자열을
 * 정규화된 프로젝트 코드 배열로 파싱. split(',') 후 trim + 빈 항목 제거.
 * resolveStrict의 early-return과 matchesStrictFlag가 동일 정규화를 공유하므로,
 * comma-only 플래그(",")·공백만 있는 값도 빈 목록으로 처리되어 불필요한 DB 조회를 생략한다.
 */
export function parseStrictProjects(envValue: string | undefined): string[] {
	return (envValue ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * matchesStrictFlag (APS-1-10): 프로젝트 코드가 STRICT_SUBMIT_TEST_PROJECTS 플래그에 포함되는지
 * 판정하는 순수 함수. case-exact 대문자 매칭. code가 null이거나 플래그가 비면 false.
 * resolveStrict의 DB hop과 분리해 단위 테스트로 매칭 로직(흔한 regression 지점)을 커버.
 */
export function matchesStrictFlag(code: string | null, envValue: string | undefined): boolean {
	return !!code && parseStrictProjects(envValue).includes(code);
}

/**
 * matchesCiGateFlag (APS-5-13): 프로젝트 코드가 CI_GATE_PROJECTS 플래그(쉼표구분, 기본 빈값)에
 * 포함되는지 판정하는 순수 함수. matchesStrictFlag와 동일 패턴/정규화 재사용(DRY).
 * 미설정(빈값/공백/comma-only) 또는 code 미매칭 → false → CI 게이트 완전 비활성(회귀 0).
 */
export function matchesCiGateFlag(code: string | null, envValue: string | undefined): boolean {
	return !!code && parseStrictProjects(envValue).includes(code);
}

export class WorkflowService {
	private taskRepo = new TaskRepository();
	private activityRepo = new ActivityRepository();
	private testRunRepo = new TestRunRepository();
	private fixAttemptRepo = new FixAttemptRepository();
	private epicRepo = new EpicRepository();
	private projectRepo = new ProjectRepository();
	private taskService = new TaskService();
	private contextService = new ContextService();
	private githubService = new GitHubService();

	/**
	 * resolveStrict (APS-1-9): STRICT_SUBMIT_TEST_PROJECTS 플래그에 이 태스크의 프로젝트 코드가
	 * 포함되는지 판정. task→epic→project 조회는 어느 hop이든 null/miss 시 false 폴백(설계된 안전 경로).
	 * 매칭은 case-exact 대문자 — auto-generate 코드는 대문자이나 명시 생성 코드는 그대로 저장되므로,
	 * operator가 실제 저장된 project.code 값에 맞춰 플래그를 설정해야 함.
	 * 플래그는 호출 시점에 읽어 테스트의 env 조작이 반영되게 함.
	 */
	private async resolveStrict(task: Task): Promise<boolean> {
		const envValue = process.env.STRICT_SUBMIT_TEST_PROJECTS;
		// 유효 코드가 없으면 DB 조회 생략 (성능). comma-only "," 등도 빈 목록으로 처리.
		if (parseStrictProjects(envValue).length === 0) return false;
		const epicId = task.epic_id ?? null;
		if (!epicId) return false;
		const epic = await this.epicRepo.findById(epicId);
		if (!epic?.project_id) return false;
		const project = await this.projectRepo.findById(epic.project_id);
		// 매칭 판정은 순수 함수로 위임 (단위 테스트 대상)
		return matchesStrictFlag(project?.code ?? null, envValue);
	}

	/**
	 * shouldEnforceCiGate (APS-5-13 F-004): 이 태스크가 CI green 게이트 대상인지 판정.
	 * resolveStrict와 동일 패턴(task→epic→project, 어느 hop이든 miss 시 false 폴백) 재사용.
	 *  - CI_GATE_PROJECTS env 미설정(빈/공백/comma-only) → false → 게이트 완전 비활성(회귀 0).
	 *  - enrolled 프로젝트면 **비-fast-track 티켓 전체**를 게이트 대상으로 본다(coarse, 프로젝트 단위).
	 *    priority proxy는 폐기됨(plan-review 해소 결정): priority는 실행 순서/긴급도이지 중요도가 아니며
	 *    스키마 default=3과 충돌. fast-track/1중 면제는 서버가 로컬 마커에 접근 불가하므로 hook(fine-grained)이 담당.
	 *  - TODO(향후): per-task fast-track 면제를 서버에서도 처리하려면 DB 플래그(ci_gate_required boolean) 컬럼
	 *    마이그레이션이 필요(별도 후속 티켓). 현재 MVP는 enrolled 프로젝트 전체 coarse 적용.
	 *  - 플래그는 호출 시점에 읽어 테스트의 env 조작이 반영되게 함.
	 */
	private async shouldEnforceCiGate(task: Task): Promise<boolean> {
		const envValue = process.env.CI_GATE_PROJECTS;
		// 유효 코드가 없으면 DB 조회 생략(성능) + 게이트 비활성(회귀 0).
		if (parseStrictProjects(envValue).length === 0) return false;
		const epicId = task.epic_id ?? null;
		if (!epicId) return false;
		const epic = await this.epicRepo.findById(epicId);
		if (!epic?.project_id) return false;
		const project = await this.projectRepo.findById(epic.project_id);
		return matchesCiGateFlag(project?.code ?? null, envValue);
	}

	/**
	 * resolveCiStatus (APS-5-13 F-002/F-003): enforce 티켓의 연결 PR을 통해 CI 상태를 조회.
	 * owner/repo/head sha는 모두 PR URL에서 파생(§2.5: PR URL이 SSOT, project.github_repo 미사용).
	 *  - PR 미연결은 호출 전(approveReview)에서 별도 throw 처리하므로 여기선 github_pr 존재 가정.
	 *  - 조회 실패(error/timeout)는 GitHubService가 state:'error' 반환 → enforce에서 fail-closed(호출자가 throw).
	 */
	private async resolveCiStatus(task: Task) {
		// github_pr는 approveReview의 PR-before-done 체크를 통과한 뒤에만 도달 → 비-null 보장
		return this.githubService.getCiStatusForPrUrl(task.github_pr ?? '');
	}

	/**
	 * startWork: 태스크를 in_progress로 전환하고 관련 컨텍스트를 반환합니다.
	 */
	async startWork(taskId: string): Promise<{
		task: Task;
		subtasks: Task[];
		dependencies: { task_id: string; depends_on: string }[];
		message: string;
	}> {
		const found = await this.taskService.getById(taskId);
		if (!found) {
			console.error(`[WorkflowService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		let task: Task;
		try {
			const result = await this.taskService.updateStatus(
				found.id,
				'in_progress',
				'작업 시작 (smart_workflow)',
			);
			task = result.task;
		} catch (e) {
			throw new Error(`작업 시작 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`);
		}

		const subtasks = await this.taskService.getSubtasks(task.id);
		const dependencies = await this.taskRepo.getDependencies(task.id);

		await this.activityRepo.create({
			task_id: task.id,
			actor: 'ai',
			action: 'workflow_start',
			payload: {
				subtask_count: subtasks.length,
				dependency_count: dependencies.length,
				ticket_code: task.ticket_code,
			},
		});

		return {
			task,
			subtasks,
			dependencies,
			message: `'${task.title}' 작업을 시작합니다 (in_progress 전환 완료)`,
		};
	}

	/**
	 * submitTest: 테스트 결과를 제출하고 결과에 따라 상태를 자동 전환합니다.
	 * - 전체 통과 → review
	 * - 실패 + 시도 < 3 → fixing
	 * - 실패 + 시도 >= 3 → blocked (에스컬레이션)
	 */
	async submitTest(
		taskId: string,
		results: TestResult[],
	): Promise<{
		task: Task;
		overall: 'pass' | 'fail';
		run_number: number;
		next_status: string;
	}> {
		// 실제 테스트 결과 증거 검증
		if (!results || results.length === 0) {
			throw new Error(
				'테스트 결과가 비어있습니다. 실제 빌드/테스트를 실행한 후 결과를 제출하세요.',
			);
		}
		const hasBuild = results.some((r) => r.test_type === 'build');
		if (!hasBuild) {
			throw new Error('빌드(build) 결과가 필수입니다. pnpm -r build를 실행하고 결과를 포함하세요.');
		}
		const missingOutput = results.find((r) => !r.output || r.output.trim().length < 10);
		if (missingOutput) {
			throw new Error(
				`테스트 '${missingOutput.test_type}'의 output이 부족합니다. 실제 실행 출력을 10자 이상 포함하세요.`,
			);
		}

		const found = await this.taskService.getById(taskId);
		if (!found) {
			console.error(`[WorkflowService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		// STRICT 검증 (APS-1-9): 플래그 활성 프로젝트는 build+lint+unit 필수 + 전 항목 pass.
		// 기존 task lookup(found) 재사용. testing 전환 전에 검증하여 실패 시 상태 불변.
		const isStrict = await this.resolveStrict(found);
		validateStrictResults(results, isStrict);

		let task = found;

		// in_progress 상태면 자동으로 testing으로 전환
		if (task.status === 'in_progress') {
			try {
				const result = await this.taskService.updateStatus(
					task.id,
					'testing',
					'테스트 제출 (smart_workflow)',
				);
				task = result.task;
			} catch (e) {
				throw new Error(
					`testing 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`,
				);
			}
		}

		// 테스트 결과 기록
		const run_number = (await this.testRunRepo.getLatestRunNumber(task.id)) + 1;
		for (const result of results) {
			await this.testRunRepo.create({
				task_id: task.id,
				run_number,
				test_type: result.test_type,
				status: result.status,
				output: result.output,
				failures: result.failures,
				duration_ms: result.duration_ms,
			});
		}

		// 전체 결과 판정
		const overall: 'pass' | 'fail' = results.some((r) => r.status === 'fail') ? 'fail' : 'pass';

		if (overall === 'pass') {
			try {
				const result = await this.taskService.updateStatus(
					task.id,
					'review',
					'테스트 통과 → 리뷰 (smart_workflow)',
					{ bypassGuard: true },
				);
				task = result.task;
			} catch (e) {
				throw new Error(
					`review 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`,
				);
			}
		} else {
			// 수정 시도 횟수 확인
			const attempts = await this.fixAttemptRepo.getLatestAttemptNumber(task.id);

			if (attempts < 3) {
				try {
					const result = await this.taskService.updateStatus(
						task.id,
						'fixing',
						'테스트 실패 → 수정 필요 (smart_workflow)',
					);
					task = result.task;
				} catch (e) {
					throw new Error(
						`fixing 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`,
					);
				}
			} else {
				try {
					const result = await this.taskService.updateStatus(
						task.id,
						'blocked',
						'3회 수정 실패 → 에스컬레이션 (smart_workflow)',
					);
					task = result.task;
				} catch (e) {
					throw new Error(
						`blocked 상태 전환 실패 (${task.ticket_code ?? task.id}): ${(e as Error).message}`,
					);
				}
			}
		}

		await this.activityRepo.create({
			task_id: task.id,
			actor: 'ai',
			action: 'test_run',
			payload: {
				overall,
				run_number,
				results_count: results.length,
				pass: results.filter((r) => r.status === 'pass').length,
				fail: results.filter((r) => r.status === 'fail').length,
				skip: results.filter((r) => r.status === 'skip').length,
				results: results.map((r) => ({
					name: r.test_type,
					status: r.status,
					duration_ms: r.duration_ms,
					runner: r.test_type,
					output: r.output,
					failures: r.failures,
				})),
				next_status: task.status,
			},
		});

		return {
			task,
			overall,
			run_number,
			next_status: task.status,
		};
	}

	/**
	 * completeFix: 수정 완료 후 재테스트(testing) 상태로 전환합니다.
	 */
	async completeFix(
		taskId: string,
		notes?: string,
	): Promise<{
		task: Task;
		message: string;
	}> {
		const found = await this.taskService.getById(taskId);
		if (!found) {
			console.error(`[WorkflowService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const fixAttempts = await this.fixAttemptRepo.findByTask(found.id);
		const lastAttempt: FixAttempt | undefined = fixAttempts.length > 0 ? fixAttempts[0] : undefined;

		let task: Task;
		try {
			const result = await this.taskService.updateStatus(
				found.id,
				'testing',
				notes ?? '수정 완료 → 재테스트 (smart_workflow)',
			);
			task = result.task;
		} catch (e) {
			throw new Error(
				`testing 상태 전환 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`,
			);
		}

		await this.activityRepo.create({
			task_id: task.id,
			actor: 'ai',
			action: 'workflow_fix_complete',
			payload: { attempt_number: lastAttempt?.attempt_number },
		});

		return {
			task,
			message: `'${task.title}' 수정 완료, 재테스트 상태로 전환됨`,
		};
	}

	/**
	 * approveReview: 리뷰를 승인하고 done으로 전환합니다.
	 * 에픽 완료율과 다음 추천 태스크를 함께 반환합니다.
	 */
	async approveReview(
		taskId: string,
		notes?: string,
	): Promise<{
		task: Task;
		epicProgress: { total: number; completed: number; rate: number } | null;
		nextRecommended: { task: Task; reason: string } | null;
		message: string;
	}> {
		// 코드 리뷰 결과 증거 검증
		if (!notes || notes.trim().length < 20) {
			throw new Error(
				'코드 리뷰 결과(notes)를 20자 이상 작성해야 합니다. code-reviewer 에이전트의 리뷰 결과를 포함하세요.',
			);
		}

		const found = await this.taskService.getById(taskId);
		if (!found) {
			console.error(`[WorkflowService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		// CI 게이트 (APS-5-13 F-002/F-004/F-008): enrolled 프로젝트(CI_GATE_PROJECTS) 티켓은
		// done 전환 직전 연결 PR head 커밋의 CI가 success가 아니면 차단(fail-closed).
		// env 미설정 시 shouldEnforceCiGate=false → 이 블록 전체 skip → 기존 done 동작 100% 보존(회귀 0).
		//
		// [done의 유일 chokepoint 불변식 — 보안 MAJOR-1]
		//   done으로 가는 상태 전환은 task-service.updateStatus에서 review→done이 WORKFLOW_ONLY로 막혀
		//   bypassGuard 없이는 거부된다. bypassGuard:true로 done을 호출하는 경로는 코드베이스 전체에서
		//   approveReview() 단 하나뿐(submit_test는 review까지만 bypass). 따라서 이 게이트(approveReview 내부)가
		//   done 전환의 유일 chokepoint이며, REST 직접 updateStatus(review→done)는 WORKFLOW_ONLY로 차단되어
		//   게이트를 우회할 수 없다. 이 불변식은 ci-gate.test.ts의 회귀 테스트로 못박혀 있다(우회 경로 추가 시 실패).
		if (await this.shouldEnforceCiGate(found)) {
			// 보안 MINOR-2: enrolled인데 API_KEY 미설정이면 서버 write 표면이 무인증(opt-in 인증 skip).
			// 게이트의 인증 전제가 깨지므로 fail-closed — 무인증 done 차단. (auth.ts: API_KEY 미설정 → 인증 skip)
			if (!process.env.API_KEY || process.env.API_KEY.trim().length === 0) {
				throw new Error(
					'CI 게이트 활성 프로젝트는 API_KEY 필수 — 무인증 변경 표면 차단(fail-closed). 서버에 API_KEY 환경변수를 설정하세요.',
				);
			}
			// F-008(MAJOR-3): CI 조회는 ref(PR head sha)가 필요하므로 PR 연결이 done의 선행 조건.
			if (!found.github_pr) {
				throw new Error(
					'CI 게이트 활성 프로젝트 — done 전 CI-green 연결 PR 필요. /ship으로 PR 생성 후 link_pr_to_task로 연결하세요.',
				);
			}
			const ci = await this.resolveCiStatus(found);

			// gap-2: 차단/통과 무관하게 판정 결과를 throw '이전'에 audit 기록(차단 이벤트 보존, 중복 기록 금지).
			await this.activityRepo.create({
				task_id: found.id,
				actor: 'ai',
				action: 'ci_gate_check',
				payload: {
					state: ci.state,
					total: ci.total,
					passed: ci.passed,
					failedChecks: ci.failedChecks,
				},
			});

			if (ci.state === 'error')
				throw new Error(
					'CI 조회 실패(error/timeout) — done 차단(fail-closed). GITHUB_TOKEN·네트워크 확인 후 재시도하세요.',
				);
			if (ci.state === 'pending')
				throw new Error('CI 미완료(진행 중) — done 차단. CI green 후 재시도하세요.');
			if (ci.state === 'failure')
				throw new Error(
					`CI 실패 — done 차단. 실패 체크: ${ci.failedChecks.join(', ') || '(상세 없음)'}`,
				);
			if (ci.state === 'none')
				throw new Error('CI 결과 없음 — PR/CI 미설정. verify.yml 동작 확인 필요.');
			// adversarial MINOR-3: success만 명시적 통과(allow-list). 미래에 CiState union이 늘어나거나
			// 비-union 상태가 들어와도 "그 외 통과"로 fall-through되지 않고 fail-closed로 차단된다.
			if (ci.state !== 'success')
				throw new Error(
					`CI 상태 미인식(${ci.state}) — done 차단(fail-closed). success가 아닌 상태는 통과시키지 않습니다.`,
				);
			// ci.state === 'success' → 통과, 계속 진행
		}

		let task: Task;
		try {
			const result = await this.taskService.updateStatus(
				found.id,
				'done',
				notes ?? '리뷰 승인 → 완료 (smart_workflow)',
				{ bypassGuard: true },
			);
			task = result.task;
		} catch (e) {
			throw new Error(
				`done 상태 전환 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`,
			);
		}

		// 에픽 완료율 계산
		let epicProgress: { total: number; completed: number; rate: number } | null = null;
		let nextRecommended: { task: Task; reason: string } | null = null;

		if (task.epic_id) {
			const epicTasks = await this.taskRepo.findByEpic(task.epic_id);
			const total = epicTasks.length;
			const completed = epicTasks.filter((t) => t.status === 'done').length;
			const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
			epicProgress = { total, completed, rate };

			// 다음 추천 태스크: 같은 프로젝트의 todo 태스크 중 의존성 모두 완료된 것
			const epic = await this.epicRepo.findById(task.epic_id);
			if (epic) {
				try {
					const sessionContext = await this.contextService.getSessionContext(epic.project_id);
					nextRecommended = sessionContext.nextRecommended;
				} catch {
					// 컨텍스트 조회 실패 시 무시 (nextRecommended는 null 유지)
				}
			}
		}

		await this.activityRepo.create({
			task_id: task.id,
			actor: 'ai',
			action: 'workflow_review_approved',
			payload: {
				notes,
				epic_progress: epicProgress,
				next_recommended: nextRecommended
					? { id: nextRecommended.task.id, title: nextRecommended.task.title }
					: null,
			},
		});

		return {
			task,
			epicProgress,
			nextRecommended,
			message: `'${task.title}' 리뷰 승인 완료. 상태: done${epicProgress ? ` (에픽 진행률: ${epicProgress.rate}%)` : ''}`,
		};
	}

	/**
	 * requestChanges: 코드 리뷰에서 수정 요청 시 in_progress로 백트랙합니다.
	 * review → in_progress 전환
	 */
	async requestChanges(
		taskId: string,
		issues: string,
	): Promise<{
		task: Task;
		message: string;
	}> {
		// 이슈 내용 검증
		if (!issues || issues.trim().length < 20) {
			throw new Error(
				'이슈 내용(issues)을 20자 이상 작성해야 합니다. 발견된 문제점을 구체적으로 설명하세요.',
			);
		}

		const found = await this.taskService.getById(taskId);
		if (!found) {
			console.error(`[WorkflowService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		if (found.status !== 'review') {
			throw new Error(`review 상태의 태스크만 수정 요청할 수 있습니다. 현재 상태: ${found.status}`);
		}

		let task: Task;
		try {
			const result = await this.taskService.updateStatus(
				found.id,
				'in_progress',
				`코드 리뷰 수정 요청: ${issues}`,
			);
			task = result.task;
		} catch (e) {
			throw new Error(
				`in_progress 상태 전환 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`,
			);
		}

		await this.activityRepo.create({
			task_id: task.id,
			actor: 'ai',
			action: 'workflow_review_changes_requested',
			payload: {
				issues,
			},
		});

		return {
			task,
			message: `'${task.title}' 코드 리뷰에서 수정 요청됨. 상태: in_progress`,
		};
	}
}
