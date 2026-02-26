import type { Task } from '../api';

const PRIORITY_CONFIG: Record<number, { label: string; bg: string; text: string }> = {
  1: { label: 'P1', bg: 'bg-red-900/60', text: 'text-red-300' },
  2: { label: 'P2', bg: 'bg-amber-900/60', text: 'text-amber-300' },
  3: { label: 'P3', bg: 'bg-blue-900/40', text: 'text-blue-300' },
  4: { label: 'P4', bg: 'bg-slate-700/60', text: 'text-slate-300' },
  5: { label: 'P5', bg: 'bg-slate-800/60', text: 'text-slate-400' },
};

const STATUS_BORDER: Record<string, string> = {
  todo: 'border-slate-700',
  in_progress: 'border-amber-500/20',
  testing: 'border-violet-500/20',
  fixing: 'border-orange-500/20',
  review: 'border-cyan-500/20',
  done: 'border-green-500/20',
  blocked: 'border-red-500/40',
};

interface TaskCardProps {
  task: Task;
  epicTitle?: string;
  epicColor?: string;
  subtaskInfo?: { completed: number; total: number };
  onClick?: (taskId: string) => void;
}

export default function TaskCard({ task, epicTitle, epicColor = 'text-blue-400', subtaskInfo, onClick }: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG[3];
  const borderColor = STATUS_BORDER[task.status] ?? 'border-slate-700';
  const isDone = task.status === 'done';
  const isBlocked = task.status === 'blocked';

  return (
    <div
      onClick={() => onClick?.(task.id)}
      className={`block rounded-lg border ${borderColor} bg-[#1A1D2E] p-3.5 transition-all hover:bg-[#1E2135] hover:border-opacity-60 cursor-pointer ${isDone ? 'opacity-70' : ''}`}
    >
      {/* Top row: Epic + Priority */}
      <div className="flex items-center justify-between mb-2">
        {epicTitle ? (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 ${epicColor}`}>
            {epicTitle}
          </span>
        ) : <span />}
        {isDone ? (
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${priority.bg} ${priority.text}`}>
            {priority.label}
          </span>
        )}
      </div>

      {/* Title */}
      <p className={`text-[13px] font-medium mb-2 ${isDone ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
        {task.title}
      </p>

      {/* Blocked warning */}
      {isBlocked && task.blocked_by && (
        <div className="flex items-center gap-1.5 bg-red-900/50 rounded px-2.5 py-1.5 mb-2">
          <svg className="w-3.5 h-3.5 text-red-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-[11px] text-red-300">Blocked: {task.blocked_by}</span>
        </div>
      )}

      {/* Progress bar for in_progress tasks */}
      {task.status === 'in_progress' && subtaskInfo && subtaskInfo.total > 0 && (
        <div className="mb-2">
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${(subtaskInfo.completed / subtaskInfo.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom row: Subtasks + Date */}
      <div className="flex items-center justify-between">
        {subtaskInfo ? (
          <span className={`text-[11px] ${isDone ? 'text-slate-600' : 'text-slate-500'}`}>
            {subtaskInfo.completed}/{subtaskInfo.total} subtasks
          </span>
        ) : <span />}
        <span className={`text-[11px] ${isDone ? 'text-slate-600' : 'text-slate-500'}`}>
          {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}
