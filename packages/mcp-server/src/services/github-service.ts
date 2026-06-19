import { Octokit } from 'octokit';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import { ProjectRepository } from '../db/repositories/project-repo.js';
import { TaskRepository } from '../db/repositories/task-repo.js';
import type { Task } from '../types/index.js';

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
	return new Octokit({ auth: token });
}

function parseRepo(githubRepo: string): { owner: string; repo: string } {
	const parts = githubRepo.split('/');
	if (parts.length !== 2)
		throw new Error(`잘못된 GitHub 저장소 형식: ${githubRepo} (owner/repo 형식이어야 합니다)`);
	return { owner: parts[0], repo: parts[1] };
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
			const msg = error instanceof Error ? error.message : String(error);
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
