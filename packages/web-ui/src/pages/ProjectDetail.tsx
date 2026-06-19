import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type BlockingAnalysis, type Epic, type ProjectStatus, type Task, api } from '../api';
import KanbanBoard from '../components/KanbanBoard';

const STATUS_DOTS: Record<string, string> = {
	todo: 'bg-indigo-500',
	in_progress: 'bg-amber-500',
	verifying: 'bg-violet-500',
	review: 'bg-cyan-500',
	done: 'bg-green-500',
	blocked: 'bg-red-500',
};

export default function ProjectDetail() {
	const { id } = useParams<{ id: string }>();
	const [status, setStatus] = useState<ProjectStatus | null>(null);
	const [blocking, setBlocking] = useState<BlockingAnalysis | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [epics, setEpics] = useState<Epic[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!id) return;
		async function load() {
			try {
				const [s, b, t] = await Promise.all([
					api.getProjectStatus(id!),
					api.getBlockingAnalysis(id!),
					api.listTasks({ project_id: id! }),
				]);
				setStatus(s);
				setBlocking(b);
				setTasks(t.tasks);
				setEpics(s.epics);
			} catch (err) {
				console.error('Failed to load project:', err);
			} finally {
				setLoading(false);
			}
		}
		load();
		const interval = setInterval(load, 3000);
		return () => clearInterval(interval);
	}, [id]);

	if (loading) return <div className="text-gray-400 animate-pulse">Loading...</div>;
	if (!status) return <div className="text-red-400">프로젝트를 찾을 수 없습니다</div>;

	const rawBreakdown = status.summary.statusBreakdown;
	// Merge testing + fixing into verifying for display
	const breakdown: Record<string, number> = {};
	for (const [key, count] of Object.entries(rawBreakdown)) {
		if (key === 'testing' || key === 'fixing') {
			breakdown.verifying = (breakdown.verifying ?? 0) + count;
		} else {
			breakdown[key] = count;
		}
	}

	return (
		<div>
			{/* Project bar */}
			<div className="flex items-center justify-between mb-5">
				<div className="flex items-center gap-3">
					<Link to="/" className="text-slate-500 hover:text-slate-300 transition-colors">
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							aria-hidden="true"
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
						</svg>
					</Link>
					<h1 className="text-base font-semibold text-slate-200">{status.project.name}</h1>
					<span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-blue-900/40 text-blue-400">
						{status.summary.completionRate}% Complete
					</span>
				</div>
				<div className="flex items-center gap-5">
					{Object.entries(breakdown).map(([key, count]) => (
						<div key={key} className="flex items-center gap-1.5">
							<span className={`w-2 h-2 rounded-full ${STATUS_DOTS[key] ?? 'bg-slate-500'}`} />
							<span className="text-xs text-slate-400 capitalize">
								{key.replace('_', ' ')}: {count}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Kanban Board */}
			<KanbanBoard tasks={tasks} epics={epics} />
		</div>
	);
}
