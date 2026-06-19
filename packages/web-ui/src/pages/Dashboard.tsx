import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Project, type ProjectStatus, api } from '../api';
import BottleneckChart from '../components/charts/BottleneckChart';
import EpicProgressChart from '../components/charts/EpicProgressChart';
import VelocityChart from '../components/charts/VelocityChart';

const STATUS_COLORS: Record<string, string> = {
	todo: 'bg-gray-600',
	in_progress: 'bg-blue-500',
	testing: 'bg-yellow-500',
	fixing: 'bg-orange-500',
	review: 'bg-purple-500',
	done: 'bg-green-500',
	blocked: 'bg-red-500',
};

export default function Dashboard() {
	const [projects, setProjects] = useState<Project[]>([]);
	const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedProject, setSelectedProject] = useState<string | null>(null);

	useEffect(() => {
		async function load() {
			try {
				const { projects: list } = await api.listProjects();
				setProjects(list);
				const statusMap: Record<string, ProjectStatus> = {};
				await Promise.all(
					list.map(async (p) => {
						try {
							statusMap[p.id] = await api.getProjectStatus(p.id);
						} catch {
							/* skip */
						}
					}),
				);
				setStatuses(statusMap);
			} catch (err) {
				console.error('Failed to load projects:', err);
				setError('API 서버에 연결할 수 없습니다');
			} finally {
				setLoading(false);
			}
		}
		load();
		const interval = setInterval(load, 5000);
		return () => clearInterval(interval);
	}, []);

	// Auto-select first project for charts
	useEffect(() => {
		if (projects.length > 0 && !selectedProject) {
			setSelectedProject(projects[0].id);
		}
	}, [projects, selectedProject]);

	if (loading) {
		return <div className="text-gray-400 animate-pulse">Loading...</div>;
	}

	if (error) return <div className="text-red-400 text-center py-12">{error}</div>;

	if (projects.length === 0) {
		return (
			<div className="text-center py-20">
				<h2 className="text-xl text-gray-400 mb-2">프로젝트가 없습니다</h2>
				<p className="text-gray-500 text-sm">MCP 도구로 프로젝트를 생성하세요</p>
			</div>
		);
	}

	const selectedStatus = selectedProject ? statuses[selectedProject] : null;

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
					Dashboard
				</h1>
				{projects.length > 1 && (
					<select
						value={selectedProject || ''}
						onChange={(e) => setSelectedProject(e.target.value)}
						className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						{projects.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				)}
			</div>

			{/* Data Visualization Section */}
			{selectedStatus && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Epic Progress Chart */}
					<div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur">
						<EpicProgressChart epics={selectedStatus.epics} />
					</div>

					{/* Bottleneck Chart */}
					<div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur">
						<BottleneckChart statusBreakdown={selectedStatus.summary.statusBreakdown} />
					</div>

					{/* Velocity Chart - Full Width */}
					<div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur">
						<VelocityChart projectId={selectedProject!} />
					</div>
				</div>
			)}

			{/* Project List */}
			<div>
				<h2 className="text-xl font-bold mb-4 text-gray-300">All Projects</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{projects.map((project) => {
						const status = statuses[project.id];
						const summary = status?.summary;
						const isSelected = selectedProject === project.id;
						return (
							<Link
								key={project.id}
								to={`/projects/${project.id}`}
								onClick={(e) => {
									// Allow selecting project for charts without navigating
									if (e.metaKey || e.ctrlKey) {
										e.preventDefault();
										setSelectedProject(project.id);
									}
								}}
								className={`block bg-gray-900 border rounded-lg p-5 transition-all ${
									isSelected
										? 'border-blue-500 shadow-lg shadow-blue-500/20'
										: 'border-gray-800 hover:border-gray-600'
								}`}
							>
								<div className="flex items-start justify-between mb-3">
									<div>
										<h2 className="text-lg font-semibold">{project.name}</h2>
										{project.description && (
											<p className="text-sm text-gray-400 mt-1">{project.description}</p>
										)}
									</div>
									<span
										className={`text-xs px-2 py-1 rounded ${project.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'}`}
									>
										{project.status}
									</span>
								</div>
								{summary && (
									<div className="space-y-3">
										<div className="flex items-center gap-3 text-sm text-gray-400">
											<span>{summary.totalEpics} epics</span>
											<span>{summary.totalTasks} tasks</span>
											<span className="text-green-400 font-medium">
												{summary.completionRate}% complete
											</span>
										</div>
										{/* Progress bar */}
										<div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
											{Object.entries(summary.statusBreakdown).map(([s, count]) => (
												<div
													key={s}
													className={`${STATUS_COLORS[s] ?? 'bg-gray-600'} transition-all`}
													style={{
														width: `${summary.totalTasks > 0 ? (count / summary.totalTasks) * 100 : 0}%`,
													}}
													title={`${s}: ${count}`}
												/>
											))}
										</div>
										{/* Status badges */}
										<div className="flex flex-wrap gap-2">
											{Object.entries(summary.statusBreakdown).map(([s, count]) => (
												<span
													key={s}
													className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300"
												>
													{s}: {count}
												</span>
											))}
										</div>
									</div>
								)}
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
}
