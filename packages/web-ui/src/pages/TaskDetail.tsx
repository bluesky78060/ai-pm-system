import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Task, api } from '../api';

interface FixHistory {
	task: Task;
	testRuns: {
		id: string;
		run_number: number;
		test_type: string;
		status: string;
		created_at: string;
	}[];
	fixAttempts: {
		id: string;
		attempt_number: number;
		fix_description: string | null;
		files_changed?: string[];
		result_status: string;
		created_at: string;
	}[];
	summary: { totalRuns: number; totalFixes: number; lastResult: string | null };
}

const STATUS_COLORS: Record<string, string> = {
	todo: 'bg-gray-600',
	in_progress: 'bg-blue-500',
	testing: 'bg-yellow-500',
	fixing: 'bg-orange-500',
	review: 'bg-purple-500',
	done: 'bg-green-500',
	blocked: 'bg-red-500',
};

export default function TaskDetail() {
	const { id } = useParams<{ id: string }>();
	const [task, setTask] = useState<Task | null>(null);
	const [subtasks, setSubtasks] = useState<Task[]>([]);
	const [fixHistory, setFixHistory] = useState<FixHistory | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!id) return;
		const taskId = id;
		async function load() {
			try {
				const [taskData, historyData] = await Promise.all([
					api.getTask(taskId),
					api.getFixHistory(taskId).catch(() => null),
				]);
				setTask(taskData.task);
				setSubtasks(taskData.subtasks);
				setFixHistory(historyData as FixHistory | null);
			} catch (err) {
				console.error('Failed to load task:', err);
				setError(true);
			} finally {
				setLoading(false);
			}
		}
		load();
	}, [id]);

	if (loading) return <div className="text-gray-400 animate-pulse">Loading...</div>;
	if (error || !task) return <div className="text-red-400">데이터를 불러올 수 없습니다</div>;

	return (
		<div>
			<Link to="/" className="text-sm text-gray-500 hover:text-gray-300 mb-4 inline-block">
				&larr; Back
			</Link>

			{/* Task header */}
			<div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
				<div className="flex items-start justify-between mb-4">
					<h1 className="text-xl font-bold">{task.title}</h1>
					<span
						className={`text-xs px-3 py-1 rounded-full ${STATUS_COLORS[task.status] ?? 'bg-gray-600'} text-white`}
					>
						{task.status}
					</span>
				</div>
				{task.description && <p className="text-gray-400 text-sm mb-4">{task.description}</p>}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
					<div>
						<span className="text-gray-500">Priority</span>
						<div className="font-medium">P{task.priority}</div>
					</div>
					<div>
						<span className="text-gray-500">Assignee</span>
						<div className="font-medium">{task.assignee}</div>
					</div>
					<div>
						<span className="text-gray-500">Created</span>
						<div className="font-medium">
							{new Date(task.created_at).toLocaleDateString('ko-KR')}
						</div>
					</div>
					<div>
						<span className="text-gray-500">Created by</span>
						<div className="font-medium">{task.created_by}</div>
					</div>
					{task.estimated_hrs != null && (
						<div>
							<span className="text-gray-500">Estimated hrs</span>
							<div className="font-medium">{task.estimated_hrs}h</div>
						</div>
					)}
					{task.actual_hrs != null && (
						<div>
							<span className="text-gray-500">Actual hrs</span>
							<div className="font-medium">{task.actual_hrs}h</div>
						</div>
					)}
				</div>
				{task.blocked_by && (
					<div className="mt-4 bg-red-950/30 border border-red-900/50 rounded p-3 text-sm text-red-300">
						Blocked: {task.blocked_by}
					</div>
				)}
				<div className="flex gap-3 mt-4">
					{task.github_pr && (
						<a
							href={task.github_pr}
							target="_blank"
							rel="noreferrer"
							className="text-xs text-blue-400 hover:underline"
						>
							PR: {task.github_pr.split('/').pop()}
						</a>
					)}
					{task.github_issue && (
						<a
							href={task.github_issue}
							target="_blank"
							rel="noreferrer"
							className="text-xs text-blue-400 hover:underline"
						>
							Issue: {task.github_issue.split('/').pop()}
						</a>
					)}
				</div>
			</div>

			{/* Subtasks */}
			{subtasks.length > 0 && (
				<div className="mb-6">
					<h2 className="text-lg font-semibold mb-3">Subtasks ({subtasks.length})</h2>
					<div className="space-y-2">
						{subtasks.map((sub) => (
							<Link
								key={sub.id}
								to={`/tasks/${sub.id}`}
								className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-600 transition-colors"
							>
								<span
									className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[sub.status] ?? 'bg-gray-600'}`}
								/>
								<span className="flex-1 text-sm">{sub.title}</span>
								<span
									className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[sub.status] ?? 'bg-gray-600'} bg-opacity-20 text-gray-300`}
								>
									{sub.status}
								</span>
							</Link>
						))}
					</div>
				</div>
			)}

			{/* Test & Fix History */}
			{fixHistory && (fixHistory.testRuns.length > 0 || fixHistory.fixAttempts.length > 0) && (
				<div>
					<h2 className="text-lg font-semibold mb-3">Test & Fix History</h2>
					<div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
						<div className="flex gap-4 text-sm text-gray-400 mb-4">
							<span>Runs: {fixHistory.summary.totalRuns}</span>
							<span>Fixes: {fixHistory.summary.totalFixes}</span>
							<span>Last: {fixHistory.summary.lastResult ?? 'N/A'}</span>
						</div>

						{/* Test Runs */}
						{fixHistory.testRuns.length > 0 && (
							<div className="space-y-2 mb-6">
								<h3 className="text-sm font-semibold text-gray-400 mb-2">Test Runs</h3>
								{fixHistory.testRuns.slice(0, 10).map((run) => (
									<div key={run.id} className="flex items-center gap-3 text-sm">
										<span
											className={`w-2 h-2 rounded-full ${run.status === 'pass' ? 'bg-green-500' : run.status === 'fail' ? 'bg-red-500' : 'bg-gray-500'}`}
										/>
										<span className="text-gray-400">Run #{run.run_number}</span>
										<span className="text-gray-300">{run.test_type}</span>
										<span className={run.status === 'pass' ? 'text-green-400' : 'text-red-400'}>
											{run.status}
										</span>
										<span className="text-gray-600 text-xs ml-auto">
											{new Date(run.created_at).toLocaleString('ko-KR')}
										</span>
									</div>
								))}
							</div>
						)}

						{/* Fix Attempts */}
						{fixHistory.fixAttempts.length > 0 && (
							<div className="space-y-2">
								<h3 className="text-sm font-semibold text-gray-400 mb-2">Fix Attempts</h3>
								{fixHistory.fixAttempts.map((attempt) => (
									<div
										key={attempt.id}
										className="bg-gray-800 border border-gray-700 rounded p-3 text-sm"
									>
										<div className="flex items-center gap-3 mb-1">
											<span
												className={`w-2 h-2 rounded-full ${attempt.result_status === 'pass' ? 'bg-green-500' : attempt.result_status === 'fail' ? 'bg-red-500' : 'bg-orange-500'}`}
											/>
											<span className="text-gray-300 font-medium">
												Attempt #{attempt.attempt_number}
											</span>
											<span
												className={`text-xs ${attempt.result_status === 'pass' ? 'text-green-400' : attempt.result_status === 'fail' ? 'text-red-400' : 'text-orange-400'}`}
											>
												{attempt.result_status}
											</span>
											<span className="text-gray-600 text-xs ml-auto">
												{new Date(attempt.created_at).toLocaleString('ko-KR')}
											</span>
										</div>
										{attempt.fix_description && (
											<p className="text-gray-400 text-xs mt-1 ml-5">{attempt.fix_description}</p>
										)}
										{attempt.files_changed &&
											Array.isArray(attempt.files_changed) &&
											attempt.files_changed.length > 0 && (
												<div className="mt-2 ml-5 flex flex-wrap gap-1">
													{attempt.files_changed.map((file: string) => (
														<span
															key={file}
															className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-mono"
														>
															{file}
														</span>
													))}
												</div>
											)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
