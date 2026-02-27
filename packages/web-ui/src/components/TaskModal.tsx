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

// SVG path constants for action icons
const ICONS = {
  // Arrow right (status_change)
  arrow: 'M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3',
  // Plus circle (create)
  plus: 'M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z',
  // Share / branch (decompose)
  branch: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  // Pencil (update)
  pencil: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125',
  // Beaker (test_run / workflow_test)
  beaker: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.798-1.345 2.798H4.543c-1.376 0-2.345-1.798-1.345-2.798L5 14.5',
  // Wrench (create_fix)
  wrench: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z',
  // Check circle (workflow_fix_complete)
  check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  // Exclamation triangle (escalate)
  warning: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  // Link (link_pr)
  link: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
  // Circle dot (create_issue)
  issue: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  // Code branch (commit_sync)
  commit: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
  // Bolt (automation_triggered)
  bolt: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
};

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string; dotColor: string }> = {
  status_change:          { label: '상태 변경',        icon: ICONS.arrow,   color: 'text-blue-400',    dotColor: 'bg-blue-500' },
  create:                 { label: '생성',             icon: ICONS.plus,    color: 'text-emerald-400', dotColor: 'bg-emerald-500' },
  decompose:              { label: '서브태스크 분해',    icon: ICONS.branch,  color: 'text-purple-400',  dotColor: 'bg-purple-500' },
  update:                 { label: '업데이트',          icon: ICONS.pencil,  color: 'text-slate-400',   dotColor: 'bg-slate-500' },
  test_run:               { label: '테스트 실행',        icon: ICONS.beaker,  color: 'text-violet-400',  dotColor: 'bg-violet-500' },
  workflow_test:          { label: '워크플로우 테스트',  icon: ICONS.beaker,  color: 'text-violet-400',  dotColor: 'bg-violet-500' },
  create_fix:             { label: '버그 수정 생성',     icon: ICONS.wrench,  color: 'text-orange-400',  dotColor: 'bg-orange-500' },
  workflow_fix_complete:  { label: '수정 완료',          icon: ICONS.check,   color: 'text-green-400',   dotColor: 'bg-green-500' },
  escalate:               { label: '에스컬레이션',       icon: ICONS.warning, color: 'text-red-400',     dotColor: 'bg-red-500' },
  link_pr:                { label: 'PR 연결',           icon: ICONS.link,    color: 'text-cyan-400',    dotColor: 'bg-cyan-500' },
  create_issue:           { label: 'Issue 생성',        icon: ICONS.issue,   color: 'text-cyan-400',    dotColor: 'bg-cyan-500' },
  commit_sync:            { label: '커밋 동기화',        icon: ICONS.commit,  color: 'text-cyan-400',    dotColor: 'bg-cyan-500' },
  automation_triggered:   { label: '자동화 실행',        icon: ICONS.bolt,    color: 'text-yellow-400',  dotColor: 'bg-yellow-500' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  todo:        { bg: 'bg-indigo-500/20',  text: 'text-indigo-300' },
  in_progress: { bg: 'bg-amber-500/20',   text: 'text-amber-300' },
  testing:     { bg: 'bg-violet-500/20',  text: 'text-violet-300' },
  fixing:      { bg: 'bg-orange-500/20',  text: 'text-orange-300' },
  review:      { bg: 'bg-cyan-500/20',    text: 'text-cyan-300' },
  done:        { bg: 'bg-green-500/20',   text: 'text-green-300' },
  blocked:     { bg: 'bg-red-500/20',     text: 'text-red-300' },
};

const STATUS_DOTS: Record<string, string> = {
  todo:        'bg-indigo-500',
  in_progress: 'bg-amber-500',
  testing:     'bg-violet-500',
  fixing:      'bg-orange-500',
  review:      'bg-cyan-500',
  done:        'bg-green-500',
  blocked:     'bg-red-500',
};

// Dot color for timeline: action-based first, then actor-based fallback
const ACTOR_DOT_COLORS: Record<string, string> = {
  ai:     'bg-violet-500',
  system: 'bg-emerald-500',
  github: 'bg-slate-500',
  human:  'bg-blue-500',
};

interface TaskModalProps {
  taskId: string;
  onClose: () => void;
}

function StatusBadge({ status }: { status: unknown }) {
  if (typeof status !== 'string') return null;
  const style = STATUS_COLORS[status] ?? { bg: 'bg-slate-500/20', text: 'text-slate-300' };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function defaultPayloadRender(payload: Record<string, unknown>) {
  return (
    <div className="space-y-1">
      {Object.entries(payload).map(([key, val]) => (
        <div key={key} className="flex gap-2">
          <span className="text-slate-500 shrink-0">{key}:</span>
          <span className="text-slate-400 break-all">
            {typeof val === 'string' ? val : JSON.stringify(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

function renderPayload(action: string, payload: Record<string, unknown> | null) {
  if (!payload) return null;

  switch (action) {
    case 'status_change': {
      return (
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={payload.from} />
            <svg className="w-3 h-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
            <StatusBadge status={payload.to} />
          </div>
          {typeof payload.notes === 'string' && payload.notes && (
            <p className="mt-1.5 text-slate-400 text-xs leading-relaxed">{payload.notes}</p>
          )}
        </div>
      );
    }

    case 'commit_sync': {
      const hash = typeof payload.commitHash === 'string' ? payload.commitHash : null;
      const shortHash = hash ? hash.slice(0, 7) : null;
      const notes = typeof payload.notes === 'string' ? payload.notes : null;
      const message = typeof payload.message === 'string' ? payload.message : null;
      return (
        <div>
          {shortHash && (
            <code className="text-cyan-300 bg-cyan-900/30 px-1.5 py-0.5 rounded font-mono text-[11px]">
              {shortHash}
            </code>
          )}
          {(notes || message) && (
            <p className="mt-1 text-slate-400 text-xs">{notes ?? message}</p>
          )}
          {!shortHash && !notes && !message && defaultPayloadRender(payload)}
        </div>
      );
    }

    case 'test_run':
    case 'workflow_test': {
      const summary = typeof payload.summary === 'object' && payload.summary !== null
        ? payload.summary as Record<string, unknown>
        : null;
      const pass = summary ? Number(summary.pass ?? 0) : Number(payload.pass ?? 0);
      const fail = summary ? Number(summary.fail ?? 0) : Number(payload.fail ?? 0);
      const skip = summary ? Number(summary.skip ?? 0) : Number(payload.skip ?? 0);
      const hasCount = pass > 0 || fail > 0 || skip > 0;
      const notes = typeof payload.notes === 'string' ? payload.notes : null;
      return (
        <div>
          {hasCount ? (
            <div className="flex gap-3 text-xs">
              <span className="text-green-400">&#10003; {pass} pass</span>
              {fail > 0 && <span className="text-red-400">&#10007; {fail} fail</span>}
              {skip > 0 && <span className="text-slate-500">&#8856; {skip} skip</span>}
            </div>
          ) : null}
          {notes && <p className="mt-1 text-slate-400 text-xs">{notes}</p>}
          {!hasCount && !notes && defaultPayloadRender(payload)}
        </div>
      );
    }

    case 'create_fix': {
      const description = typeof payload.description === 'string' ? payload.description : null;
      const fixTaskId = typeof payload.fixTaskId === 'string' ? payload.fixTaskId : null;
      const filesChanged = Array.isArray(payload.filesChanged) ? payload.filesChanged as string[] : null;
      return (
        <div>
          {description && <p className="text-slate-300 text-xs">{description}</p>}
          {fixTaskId && (
            <p className="mt-1 text-xs text-slate-500">
              수정 태스크: <span className="font-mono text-orange-300">{fixTaskId}</span>
            </p>
          )}
          {filesChanged && filesChanged.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {filesChanged.map((f, i) => (
                <span key={i} className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono">{f}</span>
              ))}
            </div>
          )}
          {!description && !fixTaskId && !filesChanged && defaultPayloadRender(payload)}
        </div>
      );
    }

    case 'escalate': {
      const reason = typeof payload.reason === 'string' ? payload.reason : null;
      const attempts = typeof payload.attempts === 'number' ? payload.attempts : null;
      return (
        <div className="bg-red-900/20 border border-red-800/30 rounded px-3 py-2">
          {reason && <p className="text-red-200 text-xs leading-relaxed">{reason}</p>}
          {attempts != null && (
            <p className="mt-1 text-red-400 text-[10px]">{attempts}회 시도 후 에스컬레이션</p>
          )}
          {!reason && !attempts && defaultPayloadRender(payload)}
        </div>
      );
    }

    case 'link_pr': {
      const prUrl = typeof payload.prUrl === 'string' ? payload.prUrl : null;
      if (!prUrl) return defaultPayloadRender(payload);
      const prNumber = prUrl.split('/').pop();
      return (
        <a href={prUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 text-xs underline underline-offset-2">
          PR #{prNumber}
        </a>
      );
    }

    case 'create_issue': {
      const issueUrl = typeof payload.issueUrl === 'string' ? payload.issueUrl : null;
      const issueNumber = typeof payload.issueNumber === 'number' || typeof payload.issueNumber === 'string'
        ? payload.issueNumber
        : null;
      if (!issueUrl) return defaultPayloadRender(payload);
      return (
        <a href={issueUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 text-xs underline underline-offset-2">
          Issue #{issueNumber ?? issueUrl.split('/').pop()}
        </a>
      );
    }

    case 'create': {
      const type = typeof payload.type === 'string' ? payload.type : null;
      const name = typeof payload.title === 'string'
        ? payload.title
        : typeof payload.name === 'string'
          ? payload.name
          : null;
      if (!type && !name) return defaultPayloadRender(payload);
      return (
        <span className="text-xs text-slate-300">
          {type && <span className="text-emerald-400 mr-1">{type}</span>}
          {name}
        </span>
      );
    }

    case 'decompose': {
      const count = typeof payload.subtaskCount === 'number' ? payload.subtaskCount : null;
      const notes = typeof payload.notes === 'string' ? payload.notes : null;
      return (
        <div>
          {count != null && (
            <span className="text-xs text-purple-300">{count}개 서브태스크로 분해</span>
          )}
          {notes && <p className="mt-1 text-slate-400 text-xs">{notes}</p>}
          {count == null && !notes && defaultPayloadRender(payload)}
        </div>
      );
    }

    case 'update': {
      const field = typeof payload.field === 'string' ? payload.field : null;
      const from = payload.from;
      const to = payload.to;
      if (!field) return defaultPayloadRender(payload);
      return (
        <span className="text-xs text-slate-400">
          <span className="text-slate-500">{field}:</span>{' '}
          <span className="text-slate-400">{String(from ?? '—')}</span>
          {' '}
          <span className="text-slate-600">&#8594;</span>
          {' '}
          <span className="text-slate-300">{String(to ?? '—')}</span>
        </span>
      );
    }

    case 'workflow_fix_complete': {
      const notes = typeof payload.notes === 'string' ? payload.notes : null;
      const fixTaskId = typeof payload.fixTaskId === 'string' ? payload.fixTaskId : null;
      return (
        <div>
          {fixTaskId && (
            <p className="text-xs text-green-300">
              수정 태스크 완료: <span className="font-mono">{fixTaskId}</span>
            </p>
          )}
          {notes && <p className="mt-1 text-slate-400 text-xs">{notes}</p>}
          {!fixTaskId && !notes && defaultPayloadRender(payload)}
        </div>
      );
    }

    case 'automation_triggered': {
      const name = typeof payload.name === 'string' ? payload.name : null;
      const trigger = typeof payload.trigger === 'string' ? payload.trigger : null;
      const notes = typeof payload.notes === 'string' ? payload.notes : null;
      return (
        <div>
          {name && <span className="text-xs text-yellow-300 font-medium">{name}</span>}
          {trigger && <span className="text-xs text-slate-500 ml-2">({trigger})</span>}
          {notes && <p className="mt-1 text-slate-400 text-xs">{notes}</p>}
          {!name && !trigger && !notes && defaultPayloadRender(payload)}
        </div>
      );
    }

    default:
      return defaultPayloadRender(payload);
  }
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
                      const actionCfg = ACTION_CONFIG[act.action];
                      const dotColor = actionCfg?.dotColor ?? ACTOR_DOT_COLORS[act.actor] ?? 'bg-slate-500';
                      const actionColor = actionCfg?.color ?? actor.color;
                      const actionLabel = actionCfg?.label ?? act.action;
                      const actionIcon = actionCfg?.icon ?? actor.icon;
                      return (
                        <div key={act.id} className="relative">
                          {/* Timeline dot — action-based color */}
                          <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[#12141F] ${dotColor}`} />
                          <div className="bg-slate-800/30 rounded-lg px-3.5 py-2.5">
                            {/* Header row: action icon + label, actor, timestamp */}
                            <div className="flex items-center gap-2 mb-1">
                              {/* Action icon + label */}
                              <svg className={`w-3.5 h-3.5 ${actionColor} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={actionIcon} />
                              </svg>
                              <span className={`text-xs font-semibold ${actionColor}`}>{actionLabel}</span>
                              {/* Actor separator + actor label */}
                              <span className="text-slate-700 text-xs">·</span>
                              <svg className={`w-3 h-3 ${actor.color} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={actor.icon} />
                              </svg>
                              <span className={`text-[11px] ${actor.color}`}>{actor.label}</span>
                              <span className="text-[10px] text-slate-600 ml-auto">{new Date(act.created_at).toLocaleString('ko-KR')}</span>
                            </div>
                            {/* Payload */}
                            {act.payload && (
                              <div className="ml-[22px] text-xs">
                                {renderPayload(act.action, act.payload)}
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
