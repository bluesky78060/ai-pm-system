import { useEffect, useState } from 'react';
import { api, type Task } from '../api';

interface FixHistory {
  task: Task;
  testRuns: { id: string; run_number: number; test_type: string; status: string; created_at: string }[];
  fixAttempts: { id: string; attempt_number: number; fix_description: string | null; files_changed?: string[]; result_status: string; created_at: string }[];
  summary: { totalRuns: number; totalFixes: number; lastResult: string | null };
}

interface Activity {
  id: number;
  task_id: string | null;
  actor: 'ai' | 'human' | 'github' | 'system';
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const ACTOR_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  ai:     { label: 'AI',     color: 'text-violet-400', icon: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.591.659H9.061a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V17a2.25 2.25 0 01-2.25 2.25H7.25A2.25 2.25 0 015 17v-2.5' },
  human:  { label: 'Human',  color: 'text-blue-400',   icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0' },
  github: { label: 'GitHub', color: 'text-slate-400',  icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101' },
  system: { label: 'System', color: 'text-emerald-400', icon: 'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93s.844.141 1.185-.058l.764-.46a1.14 1.14 0 011.37.187l.774.774a1.14 1.14 0 01.187 1.37l-.46.764c-.2.34-.224.79-.058 1.185s.506.71.93.78l.894.15c.542.09.94.56.94 1.109v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.384-.93.78s-.141.844.058 1.185l.46.764a1.14 1.14 0 01-.187 1.37l-.774.774a1.14 1.14 0 01-1.37.187l-.764-.46c-.34-.2-.79-.224-1.185-.058s-.71.506-.78.93l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93s-.844-.141-1.185.058l-.764.46a1.14 1.14 0 01-1.37-.187l-.774-.774a1.14 1.14 0 01-.187-1.37l.46-.764c.2-.34.224-.79.058-1.185s-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.148c.424-.071.764-.384.93-.781s.141-.844-.058-1.185l-.46-.764a1.14 1.14 0 01.187-1.37l.774-.774a1.14 1.14 0 011.37-.187l.764.46c.34.2.79.224 1.185.058s.71-.506.78-.93l.15-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  todo: { bg: 'bg-indigo-500/20', text: 'text-indigo-300' },
  in_progress: { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  testing: { bg: 'bg-violet-500/20', text: 'text-violet-300' },
  fixing: { bg: 'bg-orange-500/20', text: 'text-orange-300' },
  review: { bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
  done: { bg: 'bg-green-500/20', text: 'text-green-300' },
  blocked: { bg: 'bg-red-500/20', text: 'text-red-300' },
};

const STATUS_DOTS: Record<string, string> = {
  todo: 'bg-indigo-500',
  in_progress: 'bg-amber-500',
  testing: 'bg-violet-500',
  fixing: 'bg-orange-500',
  review: 'bg-cyan-500',
  done: 'bg-green-500',
  blocked: 'bg-red-500',
};

interface TaskModalProps {
  taskId: string;
  onClose: () => void;
}

export default function TaskModal({ taskId, onClose }: TaskModalProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [fixHistory, setFixHistory] = useState<FixHistory | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [taskData, historyData, activityData] = await Promise.all([
          api.getTask(taskId),
          api.getFixHistory(taskId).catch(() => null),
          api.listActivities({ task_id: taskId, limit: '50' }).catch(() => ({ activities: [] })),
        ]);
        setTask(taskData.task);
        setSubtasks(taskData.subtasks);
        setFixHistory(historyData as FixHistory | null);
        setActivities(activityData.activities as Activity[]);
      } catch {
        /* handled by !task check */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [taskId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const statusStyle = task ? STATUS_COLORS[task.status] ?? { bg: 'bg-slate-500/20', text: 'text-slate-300' } : { bg: '', text: '' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[75vh] overflow-y-auto bg-[#12141F] border border-slate-700/60 rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : !task ? (
          <div className="text-center py-20 text-red-400">데이터를 불러올 수 없습니다</div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-[#12141F] border-b border-slate-700/40 px-6 py-4 flex items-start justify-between z-10">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-2">
                  {task.ticket_code && (
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300 border border-indigo-700/30">
                      {task.ticket_code}
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${statusStyle.bg} ${statusStyle.text}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-slate-500">P{task.priority}</span>
                  <span className="text-xs text-slate-600">{new Date(task.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
                <h2 className="text-lg font-semibold text-slate-100 leading-tight">{task.title}</h2>
              </div>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1 -mr-1 -mt-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Description */}
              {task.description && (
                <p className="text-sm text-slate-400 leading-relaxed">{task.description}</p>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-3 gap-4">
                <InfoItem label="Assignee" value={task.assignee} />
                <InfoItem label="Created by" value={task.created_by} />
                <InfoItem label="Priority" value={`P${task.priority}`} />
                {task.estimated_hrs != null && <InfoItem label="Estimated" value={`${task.estimated_hrs}h`} />}
                {task.actual_hrs != null && <InfoItem label="Actual" value={`${task.actual_hrs}h`} />}
                {task.completed_at && <InfoItem label="Completed" value={new Date(task.completed_at).toLocaleDateString('ko-KR')} />}
              </div>

              {/* Blocked warning */}
              {task.blocked_by && (
                <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/40 rounded-lg px-4 py-3">
                  <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-sm text-red-300">Blocked: {task.blocked_by}</span>
                </div>
              )}

              {/* GitHub links */}
              {(task.github_pr || task.github_issue) && (
                <div className="flex gap-3">
                  {task.github_pr && (
                    <a href={task.github_pr} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                      </svg>
                      PR #{task.github_pr.split('/').pop()}
                    </a>
                  )}
                  {task.github_issue && (
                    <a href={task.github_issue} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Issue #{task.github_issue.split('/').pop()}
                    </a>
                  )}
                </div>
              )}

              {/* Subtasks */}
              {subtasks.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">
                    Subtasks ({subtasks.filter(s => s.status === 'done').length}/{subtasks.length})
                  </h3>
                  <div className="space-y-1.5">
                    {subtasks.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center gap-2.5 text-sm py-1.5 px-3 rounded-md bg-slate-800/40"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOTS[sub.status] ?? 'bg-slate-500'}`} />
                        <span className={`flex-1 ${sub.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                          {sub.title}
                        </span>
                        <span className="text-[10px] text-slate-500 capitalize">{sub.status.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Log */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">
                  활동 로그 ({activities.length})
                </h3>
                {activities.length === 0 ? (
                  <div className="text-xs text-slate-500 bg-slate-800/30 rounded-lg px-4 py-6 text-center">
                    아직 활동 기록이 없습니다
                  </div>
                ) : (
                  <div className="relative pl-4 border-l border-slate-700/60 space-y-3">
                    {activities.map((act) => {
                      const actor = ACTOR_CONFIG[act.actor] ?? ACTOR_CONFIG.human;
                      const payload = act.payload;
                      return (
                        <div key={act.id} className="relative">
                          {/* Timeline dot */}
                          <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[#12141F] ${
                            act.actor === 'ai' ? 'bg-violet-500' : act.actor === 'system' ? 'bg-emerald-500' : act.actor === 'github' ? 'bg-slate-500' : 'bg-blue-500'
                          }`} />
                          <div className="bg-slate-800/30 rounded-lg px-3.5 py-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              <svg className={`w-3.5 h-3.5 ${actor.color} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={actor.icon} />
                              </svg>
                              <span className={`text-xs font-medium ${actor.color}`}>{actor.label}</span>
                              <span className="text-xs text-slate-300 font-medium">{act.action}</span>
                              <span className="text-[10px] text-slate-600 ml-auto">{new Date(act.created_at).toLocaleString('ko-KR')}</span>
                            </div>
                            {payload && (
                              <div className="ml-5.5 text-xs text-slate-400 space-y-1">
                                {typeof payload === 'object' && Object.entries(payload).map(([key, val]) => (
                                  <div key={key} className="flex gap-2">
                                    <span className="text-slate-500 shrink-0">{key}:</span>
                                    <span className="text-slate-400 break-all">{typeof val === 'string' ? val : JSON.stringify(val)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Test & Fix History */}
              {fixHistory && (fixHistory.testRuns.length > 0 || fixHistory.fixAttempts.length > 0) && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Test & Fix History</h3>
                  <div className="bg-slate-800/30 rounded-lg p-4 space-y-4">
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>Runs: {fixHistory.summary.totalRuns}</span>
                      <span>Fixes: {fixHistory.summary.totalFixes}</span>
                      <span>Last: {fixHistory.summary.lastResult ?? 'N/A'}</span>
                    </div>

                    {fixHistory.testRuns.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Test Runs</h4>
                        {fixHistory.testRuns.slice(0, 5).map((run) => (
                          <div key={run.id} className="flex items-center gap-2.5 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full ${run.status === 'pass' ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-slate-400">#{run.run_number}</span>
                            <span className="text-slate-300">{run.test_type}</span>
                            <span className={run.status === 'pass' ? 'text-green-400' : 'text-red-400'}>{run.status}</span>
                            <span className="text-slate-600 ml-auto">{new Date(run.created_at).toLocaleString('ko-KR')}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {fixHistory.fixAttempts.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fix Attempts</h4>
                        {fixHistory.fixAttempts.map((attempt) => (
                          <div key={attempt.id} className="bg-slate-800/60 rounded-md p-3 text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${attempt.result_status === 'pass' ? 'bg-green-500' : attempt.result_status === 'fail' ? 'bg-red-500' : 'bg-orange-500'}`} />
                              <span className="text-slate-300 font-medium">Attempt #{attempt.attempt_number}</span>
                              <span className={attempt.result_status === 'pass' ? 'text-green-400' : attempt.result_status === 'fail' ? 'text-red-400' : 'text-orange-400'}>
                                {attempt.result_status}
                              </span>
                              <span className="text-slate-600 ml-auto">{new Date(attempt.created_at).toLocaleString('ko-KR')}</span>
                            </div>
                            {attempt.fix_description && (
                              <p className="text-slate-400 ml-3.5">{attempt.fix_description}</p>
                            )}
                            {attempt.files_changed && Array.isArray(attempt.files_changed) && attempt.files_changed.length > 0 && (
                              <div className="mt-1.5 ml-3.5 flex flex-wrap gap-1">
                                {attempt.files_changed.map((file: string, i: number) => (
                                  <span key={i} className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono">{file}</span>
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
          </>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm text-slate-300">{value}</div>
    </div>
  );
}
