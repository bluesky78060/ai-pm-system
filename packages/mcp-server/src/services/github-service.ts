import { Octokit } from 'octokit';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { ProjectRepository } from '../db/repositories/project-repo.js';
import { TaskRepository } from '../db/repositories/task-repo.js';
import type { Task } from '../types/index.js';
import { sanitizeErrorMessage } from './_security-base.js';

const taskRepo = new TaskRepository();
const projectRepo = new ProjectRepository();
const activityRepo = new ActivityRepository();

function getOctokit(): Octokit {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		throw new Error(
			'GITHUB_TOKEN 환경변수가 설정되지 않았습니다. GitHub 연동을 위해 Personal Access Token을 설정하세요.',
		);
	}
	// APS-5-13(MAJOR-1): 10초 request timeout. 네트워크 hang을 error 상태로 매핑하기 위함.
	return new Octokit({ auth: token, request: { timeout: 10_000 } });
}

function parseRepo(githubRepo: string): { owner: string; repo: string } {
	const parts = githubRepo.split('/');
	if (parts.length !== 2)
		throw new Error(`잘못된 GitHub 저장소 형식: ${githubRepo} (owner/repo 형식이어야 합니다)`);
	return { owner: parts[0], repo: parts[1] };
}

/**
 * CiState (APS-5-13): 커밋 CI 집계 상태.
 * - success: 모든 CI 항목이 success/neutral/skipped (또는 combined success)
 * - pending: 미완 항목 존재(queued/in_progress/null conclusion 또는 combined pending), 또는 freshly-pushed 유예
 * - failure: failure/cancelled/timed_out/action_required/stale 항목 존재 (또는 combined failure)
 * - none: 두 소스 통틀어 CI 항목 0개 (CI 미설정) + freshly-pushed 유예 미해당
 * - error: 토큰 부재/네트워크/403/timeout 등 조회 자체 실패 (getCommitCiStatus 내부 try/catch)
 */
export type CiState = 'success' | 'pending' | 'failure' | 'none' | 'error';

export interface CiStatus {
	state: CiState;
	total: number;
	passed: number;
	failedChecks: string[];
}

/** check_runs[].conclusion 중 실패로 간주하는 값 */
const FAILURE_CONCLUSIONS = new Set([
	'failure',
	'cancelled',
	'timed_out',
	'action_required',
	'stale',
]);
/** check_runs[].conclusion 중 성공(중립 포함)으로 간주하는 값 */
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

/** aggregateCiStatus 입력: octokit 응답을 정규화한 구조 (테스트는 이 순수 함수만 호출) */
export interface CiAggregationInput {
	/** checks.listForRef의 check_runs[] (없으면 빈 배열) */
	checkRuns: { name?: string; status?: string | null; conclusion?: string | null }[];
	/** getCombinedStatusForRef 응답 (없으면 null) */
	combined: { state?: string; total_count?: number } | null;
	/** ref가 freshly-pushed(권장 90초)인지 — checks 0개여도 pending 유예 */
	freshlyPushed?: boolean;
}

/**
 * aggregateCiStatus (APS-5-13 MAJOR-4): check-runs ∪ combined-status를 UNION 집계.
 * 순수 함수(octokit/DB 비의존) — 단위 테스트 대상.
 *
 * UNION 규칙: "해당 소스 항목 0개"는 중립(무시). 빈 소스가 전체를 pending/failure로 끌어내리지 않는다.
 *  - Actions-only repo는 combined-status가 비어 state:'pending'을 반환할 수 있음(total_count 0).
 *    이때 combined를 중립 처리해 green check-runs를 pending으로 오판하지 않음(combined 빈→pending 강제 금지).
 *
 * 우선순위(UNION 후):
 *  1. 두 소스 통틀어 항목 0개 → freshlyPushed면 'pending'(유예), 아니면 'none'
 *  2. ≥1 항목 failure → 'failure'
 *  3. ≥1 항목 미완(pending) → 'pending'
 *  4. 그 외(전부 success/neutral/skipped) → 'success'
 */
export function aggregateCiStatus(input: CiAggregationInput): CiStatus {
	const { checkRuns, combined, freshlyPushed } = input;

	// combined-status는 total_count >= 1일 때만 신호로 취급 (빈 소스 중립화)
	const combinedHasItems = !!combined && (combined.total_count ?? 0) >= 1;
	const combinedState = combinedHasItems ? combined?.state : undefined;

	let hasFailure = false;
	let hasPending = false;
	const failedChecks: string[] = [];
	let passed = 0;

	for (const run of checkRuns) {
		const conclusion = run.conclusion ?? null;
		const status = run.status ?? null;
		if (conclusion === null || status === 'queued' || status === 'in_progress') {
			// 아직 완료되지 않음
			hasPending = true;
		} else if (FAILURE_CONCLUSIONS.has(conclusion)) {
			hasFailure = true;
			failedChecks.push(run.name ?? conclusion);
		} else if (SUCCESS_CONCLUSIONS.has(conclusion)) {
			passed++;
		} else {
			// 알 수 없는 conclusion → 보수적으로 pending 취급 (성공으로 오판 금지)
			hasPending = true;
		}
	}

	// combined-status 신호 합성 (≥1 항목일 때만)
	if (combinedState === 'failure') {
		hasFailure = true;
		failedChecks.push('combined-status');
	} else if (combinedState === 'pending') {
		hasPending = true;
	} else if (combinedState === 'success') {
		passed += combined?.total_count ?? 0;
	} else if (combinedHasItems) {
		// APS-5-13(adversarial MINOR-1): 항목이 있는데(state union 외) 알 수 없는 combined state
		// → 보수적으로 pending 취급(가짜 green 차단). check_runs unknown conclusion 처리와 대칭.
		hasPending = true;
	}

	// APS-5-13(code-reviewer MINOR-1): total/passed는 check-runs와 combined-status를 단순 합산한
	// **dedup 안 된 union upper-bound count**다(동일 체크가 두 소스에 나타나면 중복 카운트 가능).
	// 게이트 판정은 state(hasFailure/hasPending)로만 하므로 정확 카운트가 불필요 — total/passed는 audit 표시용.
	const total = checkRuns.length + (combinedHasItems ? (combined?.total_count ?? 0) : 0);

	// 1. 두 소스 모두 0개
	if (total === 0) {
		// gap-1: freshly-pushed면 checks 미생성일 수 있으므로 none 아닌 pending 유예
		return { state: freshlyPushed ? 'pending' : 'none', total: 0, passed: 0, failedChecks: [] };
	}
	// 2. 실패 우선
	if (hasFailure) return { state: 'failure', total, passed, failedChecks };
	// 3. 미완
	if (hasPending) return { state: 'pending', total, passed, failedChecks };
	// 4. 전부 성공
	return { state: 'success', total, passed, failedChecks };
}

/** PR head commit이 freshly-pushed(유예 시간 이내)인지 판정 (gap-1, 권장 90초) */
const FRESH_PUSH_GRACE_MS = 90_000;
function isFreshlyPushed(committedAt: string | null | undefined): boolean {
	if (!committedAt) return false;
	const t = Date.parse(committedAt);
	if (Number.isNaN(t)) return false;
	return Date.now() - t <= FRESH_PUSH_GRACE_MS;
}

export class GitHubService {
	/**
	 * link_pr_to_task: Link a PR URL to a task.
	 * Updates task.github_pr field and logs activity.
	 */
	async linkPrToTask(taskId: string, prUrl: string): Promise<{ task: Task; message: string }> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[GitHubService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const updated = await taskRepo.update(taskId, { github_pr: prUrl });

		await activityRepo.create({
			task_id: taskId,
			actor: 'ai',
			action: 'link_pr',
			payload: { prUrl },
		});

		return {
			task: updated,
			message: `PR 연결됨: '${task.title}' ← ${prUrl}`,
		};
	}

	/**
	 * get_pr_status: Get the status of a PR linked to a task.
	 * Fetches live status from GitHub API if token is available.
	 */
	async getPrStatus(taskId: string): Promise<{
		task: Task;
		pr: {
			url: string;
			state: string;
			title: string;
			mergeable: boolean | null;
			reviewDecision: string | null;
			checks: string;
		} | null;
		message: string;
	}> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[GitHubService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		if (!task.github_pr) {
			return { task, pr: null, message: `'${task.title}'에 연결된 PR이 없습니다` };
		}

		// Parse PR URL: https://github.com/owner/repo/pull/123
		const prMatch = task.github_pr.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
		if (!prMatch) {
			return {
				task,
				pr: {
					url: task.github_pr,
					state: 'unknown',
					title: '',
					mergeable: null,
					reviewDecision: null,
					checks: 'unknown',
				},
				message: `PR URL 형식을 파싱할 수 없습니다: ${task.github_pr}`,
			};
		}

		try {
			const octokit = getOctokit();
			const [owner, repo, prNumber] = [prMatch[1], prMatch[2], Number.parseInt(prMatch[3])];

			const { data: pr } = await octokit.rest.pulls.get({
				owner,
				repo,
				pull_number: prNumber,
			});

			// Get review status
			const { data: reviews } = await octokit.rest.pulls.listReviews({
				owner,
				repo,
				pull_number: prNumber,
			});
			const latestReview = reviews.length > 0 ? reviews[reviews.length - 1] : null;

			return {
				task,
				pr: {
					url: task.github_pr,
					state: pr.state,
					title: pr.title,
					mergeable: pr.mergeable,
					reviewDecision: latestReview?.state ?? null,
					checks: pr.mergeable_state ?? 'unknown',
				},
				message: `PR #${prNumber} 상태: ${pr.state} (${pr.mergeable_state})`,
			};
		} catch (error) {
			const rawMsg = error instanceof Error ? error.message : String(error);
			// APS-5-13(MINOR-3): 원본 에러를 그대로 노출하면 GITHUB_TOKEN(Bearer 헤더 등)이 메시지에
			// 섞여 leak될 수 있으므로 sanitizeErrorMessage로 마스킹. (4중 방어: raw 키 + Bearer/Basic 등)
			const msg = sanitizeErrorMessage(rawMsg, process.env.GITHUB_TOKEN);
			// NOTE(APS-5-13): 여기 `state:'error'`는 get_pr_status(mergeable_state proxy) 경로의
			// 조회 실패 표시다. CI 게이트가 쓰는 getCommitCiStatus의 5번째 상태 `error`(CI 집계 경로)와는
			// 별개의 반환 — 후자는 CiStatus.state로 노출되며 enforce 시 fail-closed의 트리거가 된다.
			return {
				task,
				pr: {
					url: task.github_pr,
					state: 'error',
					title: '',
					mergeable: null,
					reviewDecision: null,
					checks: 'error',
				},
				message: `PR 상태 조회 실패: ${msg}`,
			};
		}
	}

	/**
	 * getCommitCiStatus (APS-5-13 F-003): 특정 ref(PR head sha)의 GitHub CI 상태를 UNION 집계.
	 *  - checks.listForRef(check_runs[].conclusion) ∪ repos.getCombinedStatusForRef(legacy commit statuses)
	 *  - "해당 소스 항목 0개"는 중립(무시) — aggregateCiStatus 참조(MAJOR-4: Actions-only combined 빈→pending 강제 금지).
	 *  - freshly-pushed(90초 이내, checks 미생성 가능) 유예: checks 0개여도 none 아닌 pending(gap-1).
	 *  - 토큰 부재/네트워크/403/timeout 등 throw는 내부 try/catch로 잡아 state:'error' 반환(MAJOR-1, 5번째 상태).
	 *    이 `error`는 getPrStatus catch의 `state:'error'`(mergeable_state 경로)와 별개로, enforce 게이트의 fail-closed 트리거.
	 */
	async getCommitCiStatus(owner: string, repo: string, ref: string): Promise<CiStatus> {
		try {
			const octokit = getOctokit();

			// freshly-pushed 판정용 commit pushed 시각 (실패해도 본 집계는 진행)
			let committedAt: string | null = null;
			try {
				const { data: commit } = await octokit.rest.repos.getCommit({ owner, repo, ref });
				committedAt = commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null;
			} catch {
				// 커밋 메타 조회 실패는 치명적 아님(유예 판정만 영향) — committedAt=null 유지
			}

			// APS-5-13(adversarial MINOR-2): check_runs는 100개 초과 가능 → paginate로 전체 수집.
			// 단일 per_page:100 페이지만 보면 100개 이후 실패 체크를 놓쳐 가짜 green이 될 수 있음.
			const checkRuns = await octokit.paginate(octokit.rest.checks.listForRef, {
				owner,
				repo,
				ref,
				per_page: 100,
			});

			let combined: { state?: string; total_count?: number } | null = null;
			try {
				const { data } = await octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref });
				combined = { state: data.state, total_count: data.total_count };
			} catch {
				// combined-status 조회 실패는 중립 처리(빈 소스와 동일) — check-runs만으로 판정
				combined = null;
			}

			return aggregateCiStatus({
				checkRuns: checkRuns.map((r) => ({
					name: r.name,
					status: r.status,
					conclusion: r.conclusion,
				})),
				combined,
				freshlyPushed: isFreshlyPushed(committedAt),
			});
		} catch {
			// MAJOR-1: 토큰 부재/네트워크/403/timeout → error 반환(throw 아님). enforce 정책은 호출자(Phase 3)에서.
			return { state: 'error', total: 0, passed: 0, failedChecks: [] };
		}
	}

	/**
	 * getCiStatusForPrUrl (APS-5-13): PR URL에서 owner/repo/prNumber를 파싱하고(§2.5: PR URL이 owner/repo의 SSOT)
	 * PR head sha를 조회한 뒤 getCommitCiStatus로 CI 상태를 반환.
	 *  - PR URL 형식 불일치 / head sha 조회 실패 / 토큰 부재 → state:'error'(enforce면 fail-closed 트리거).
	 */
	async getCiStatusForPrUrl(prUrl: string): Promise<CiStatus> {
		const prMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
		if (!prMatch) {
			return { state: 'error', total: 0, passed: 0, failedChecks: ['PR URL 파싱 실패'] };
		}
		const owner = prMatch[1];
		const repo = prMatch[2];
		const prNumber = Number.parseInt(prMatch[3], 10);
		try {
			const octokit = getOctokit();
			const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
			const headSha = pr.head?.sha;
			if (!headSha) {
				return { state: 'error', total: 0, passed: 0, failedChecks: ['PR head sha 없음'] };
			}
			return this.getCommitCiStatus(owner, repo, headSha);
		} catch {
			// 토큰 부재/네트워크/403/timeout → error (MAJOR-1)
			return { state: 'error', total: 0, passed: 0, failedChecks: ['PR 조회 실패'] };
		}
	}

	/**
	 * create_github_issue: Create a GitHub Issue from a task.
	 * Updates task.github_issue field with the created issue URL.
	 */
	async createGithubIssue(
		taskId: string,
		projectId: string,
		labels?: string[],
	): Promise<{ task: Task; issueUrl: string; issueNumber: number; message: string }> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[GitHubService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const project = await projectRepo.findById(projectId);
		if (!project) {
			console.error(`[GitHubService] Project not found: ${projectId}`);
			throw new Error('프로젝트를 찾을 수 없습니다');
		}
		if (!project.github_repo)
			throw new Error(`프로젝트에 GitHub 저장소가 설정되지 않았습니다: ${project.name}`);

		const { owner, repo } = parseRepo(project.github_repo);
		const octokit = getOctokit();

		const body = [
			task.description ?? '',
			'',
			'---',
			`**PM Task ID:** \`${task.id}\``,
			`**Priority:** ${task.priority}`,
			`**Status:** ${task.status}`,
			`**Assignee:** ${task.assignee}`,
		].join('\n');

		const { data: issue } = await octokit.rest.issues.create({
			owner,
			repo,
			title: task.title,
			body,
			labels: labels ?? [],
		});

		const updated = await taskRepo.update(taskId, { github_issue: issue.html_url });

		await activityRepo.create({
			task_id: taskId,
			actor: 'ai',
			action: 'create_issue',
			payload: { issueUrl: issue.html_url, issueNumber: issue.number },
		});

		return {
			task: updated,
			issueUrl: issue.html_url,
			issueNumber: issue.number,
			message: `GitHub Issue #${issue.number} 생성됨: '${task.title}'`,
		};
	}

	/**
	 * sync_commit_progress: Link a commit to a task and optionally update progress notes.
	 */
	async syncCommitProgress(
		taskId: string,
		commitHash: string,
		notes?: string,
		message?: string,
		filesChanged?: number,
		additions?: number,
		deletions?: number,
	): Promise<{ task: Task; message: string }> {
		const task = await taskRepo.findById(taskId);
		if (!task) {
			console.error(`[GitHubService] Task not found: ${taskId}`);
			throw new Error('태스크를 찾을 수 없습니다');
		}

		const payload: Record<string, unknown> = { commitHash, notes };
		if (message !== undefined) payload.message = message;
		if (filesChanged !== undefined) payload.files_changed = filesChanged;
		if (additions !== undefined) payload.additions = additions;
		if (deletions !== undefined) payload.deletions = deletions;

		await activityRepo.create({
			task_id: taskId,
			actor: 'ai',
			action: 'commit_sync',
			payload,
		});

		return {
			task,
			message: `커밋 동기화: '${task.title}' ← ${commitHash.substring(0, 7)}${notes ? ` (${notes})` : ''}`,
		};
	}
}
