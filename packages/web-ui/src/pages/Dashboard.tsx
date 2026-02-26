import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Project, type ProjectStatus } from '../api';

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
            } catch { /* skip */ }
          })
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Projects</h1>
      <div className="grid gap-4">
        {projects.map((project) => {
          const status = statuses[project.id];
          const summary = status?.summary;
          return (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold">{project.name}</h2>
                  {project.description && (
                    <p className="text-sm text-gray-400 mt-1">{project.description}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded ${project.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
                  {project.status}
                </span>
              </div>
              {summary && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span>{summary.totalEpics} epics</span>
                    <span>{summary.totalTasks} tasks</span>
                    <span className="text-green-400 font-medium">{summary.completionRate}% complete</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
                    {Object.entries(summary.statusBreakdown).map(([s, count]) => (
                      <div
                        key={s}
                        className={`${STATUS_COLORS[s] ?? 'bg-gray-600'} transition-all`}
                        style={{ width: `${summary.totalTasks > 0 ? (count / summary.totalTasks) * 100 : 0}%` }}
                        title={`${s}: ${count}`}
                      />
                    ))}
                  </div>
                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.statusBreakdown).map(([s, count]) => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
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
  );
}
