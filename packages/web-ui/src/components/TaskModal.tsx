import { useEffect, useState, useCallback } from 'react';
import { api, type Task } from '../api';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Activity {
  id: number;
  task_id: string | null;
  actor: 'ai' | 'human' | 'github' | 'system';
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface FixHistory {
  task: Task;
  testRuns: { id: string; run_number: number; test_type: string; status: string; created_at: string }[];
  fixAttempts: { id: string; attempt_number: number; fix_description: string | null; files_changed?: string[]; result_status: string; created_at: string }[];
  summary: { totalRuns: number; totalFixes: number; lastResult: string | null };
}

/** Activities grouped by status stage */
interface StageGroup {
  status: string;
  label: string;
  icon: string;
  activities: Activity[];
  startTime: string;
  endTime: string;
  durationSeconds: number;
  testFailCount: number;
  fixCount: number;
  passed: boolean;
}

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const STATUS_ORDER = ['todo', 'in_progress', 'testing', 'fixing', 'review', 'done'];

const STATUS_META: Record<string, { label: string; icon: string; color: string; bg: string; dotDone: string; dotFail: string }> = {
  todo:        { label: 'todo',        icon: '\uD83D\uDCCB', color: 'text-indigo-300',  bg: 'bg-indigo-500/20',  dotDone: 'border-green-500 text-green-500', dotFail: '' },
  in_progress: { label: 'in_progress', icon: '\u26A1',       color: 'text-amber-300',   bg: 'bg-amber-500/20',   dotDone: 'border-green-500 text-green-500', dotFail: '' },
  testing:     { label: 'testing',     icon: '\uD83E\uDDEA', color: 'text-violet-300',  bg: 'bg-violet-500/20',  dotDone: 'border-green-500 text-green-500', dotFail: 'border-red-500 text-red-500' },
  fixing:      { label: 'fixing',      icon: '\uD83D\uDD27', color: 'text-orange-300',  bg: 'bg-orange-500/20',  dotDone: 'border-green-500 text-green-500', dotFail: '' },
  review:      { label: 'review',      icon: '\uD83D\uDC41\uFE0F', color: 'text-cyan-300',    bg: 'bg-cyan-500/20',    dotDone: 'border-green-500 text-green-500', dotFail: '' },
  done:        { label: 'done',        icon: '\uD83C\uDF89', color: 'text-green-300',   bg: 'bg-green-500/20',   dotDone: 'border-green-500 text-green-500', dotFail: '' },
  blocked:     { label: 'blocked',     icon: '\uD83D\uDEAB', color: 'text-red-300',     bg: 'bg-red-500/20',     dotDone: '', dotFail: 'border-red-500 text-red-500' },
};

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatTimeRange(start: string, end: string): string {
  const s = formatTime(start);
  const e = formatTime(end);
  return s === e ? s : `${s} – ${e}`;
}

/** Group activities by status transitions into stage cards */
function buildStageGroups(activities: Activity[], task: Task): StageGroup[] {
  if (activities.length === 0) return [];

  // Sort ascending by time
  const sorted = [...activities].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Extract status flow from status_change activities
  const statusChanges = sorted.filter(a => a.action === 'status_change' && a.payload);
  const stages: { status: string; startTime: string; endTime: string }[] = [];

  // Initial stage: 'todo' or from first status_change's 'from'
  const firstFrom = statusChanges.length > 0 ? String(statusChanges[0].payload?.from ?? 'todo') : task.status;
  stages.push({
    status: firstFrom,
    startTime: task.created_at,
    endTime: statusChanges.length > 0 ? statusChanges[0].created_at : sorted[sorted.length - 1].created_at,
  });

  // Build stages from status changes
  for (let i = 0; i < statusChanges.length; i++) {
    const sc = statusChanges[i];
    const toStatus = String(sc.payload?.to ?? 'unknown');
    const startTime = sc.created_at;
    const endTime = i + 1 < statusChanges.length ? statusChanges[i + 1].created_at : (task.completed_at ?? sorted[sorted.length - 1].created_at);
    stages.push({ status: toStatus, startTime, endTime });
  }

  // Assign activities to their stage
  return stages.map((stage) => {
    const stageStart = new Date(stage.startTime).getTime();
    const stageEnd = new Date(stage.endTime).getTime();
    const meta = STATUS_META[stage.status] ?? STATUS_META.todo;

    // Activities that belong to this stage (between start and end)
    const stageActivities = sorted.filter(a => {
      const t = new Date(a.created_at).getTime();
      return t >= stageStart && t <= stageEnd;
    });

    // Count test failures and fixes
    const testFailCount = stageActivities.filter(a =>
      (a.action === 'test_run' || a.action === 'workflow_test') &&
      a.payload && (a.payload.summary as Record<string, unknown>)?.fail
    ).length;
    const fixCount = stageActivities.filter(a => a.action === 'create_fix' || a.action === 'workflow_fix_complete').length;

    const durationSeconds = Math.max(0, Math.floor((stageEnd - stageStart) / 1000));
    const passed = stage.status === 'done' || (
      stageActivities.some(a => a.action === 'status_change' && String(a.payload?.from) === stage.status)
    );

    return {
      status: stage.status,
      label: meta.label,
      icon: meta.icon,
      activities: stageActivities,
      startTime: stage.startTime,
      endTime: stage.endTime,
      durationSeconds,
      testFailCount,
      fixCount,
      passed,
    };
  });
}

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function StatusBadge({ status }: { status: unknown }) {
  if (typeof status !== 'string') return null;
  const meta = STATUS_META[status];
  const bg = meta?.bg ?? 'bg-slate-500/20';
  const color = meta?.color ?? 'text-slate-300';
  return (
    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${bg} ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function Pill({ variant, children }: { variant: 'pass' | 'fail' | 'fix' | 'done'; children: React.ReactNode }) {
  const styles = {
    pass: 'bg-green-500/10 text-green-400 border-green-500/20',
    fail: 'bg-red-500/10 text-red-400 border-red-500/20',
    fix:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
    done: 'bg-green-500/10 text-green-400 border-green-500/20',
  };
  return (
    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-xl border ${styles[variant]}`}>
      {children}
    </span>
  );
}

/** Render a single activity's content inside a stage card */
function ActivityContent({ activity }: { activity: Activity }) {
  const { action, payload } = activity;
  if (!payload) return null;

  switch (action) {
    case 'status_change': {
      const notes = typeof payload.notes === 'string' ? payload.notes : null;
      return (
        <div className="mt-2.5">
          <div className="inline-flex items-center gap-2 bg-[#1A1D2E] border border-[#2e3348] rounded-md px-3 py-1.5 font-mono text-xs">
            <span className="text-[#555e7a]">{String(payload.from ?? '')}</span>
            <span className="text-[#555e7a]">&mdash;&blacktriangleright;</span>
            <StatusBadge status={payload.to} />
          </div>
          {notes && <p className="text-[11px] font-mono text-[#555e7a] mt-1.5">{notes}</p>}
        </div>
      );
    }

    case 'ai_analysis': {
      const analysis = typeof payload.analysis === 'string' ? payload.analysis : null;
      if (!analysis) return null;
      return (
        <div className="mt-3 bg-[rgba(108,143,255,0.05)] border border-[rgba(108,143,255,0.18)] border-l-[3px] border-l-[#6c8fff] rounded-lg px-3.5 py-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#6c8fff] mb-1.5 flex items-center gap-1.5">
            <span>\uD83E\uDD16</span> AI \uBD84\uC11D
          </div>
          <div className="text-xs text-[#9198b4] leading-relaxed whitespace-pre-wrap">{analysis}</div>
        </div>
      );
    }

    case 'create': {
      const type = typeof payload.type === 'string' ? payload.type : null;
      const name = typeof payload.title === 'string' ? payload.title : typeof payload.name === 'string' ? payload.name : null;
      return (
        <div className="mt-2 text-xs text-[#9198b4]">
          {type && <span className="text-green-400 font-mono mr-1">{type}</span>}
          {name && <span>{name}</span>}
        </div>
      );
    }

    case 'decompose': {
      const count = typeof payload.subtaskCount === 'number' ? payload.subtaskCount : null;
      const ids = Array.isArray(payload.subtaskIds) ? payload.subtaskIds as string[] : null;
      return (
        <div className="mt-2">
          {count != null && <span className="text-xs text-purple-300 font-mono">{count}\uAC1C \uC11C\uBE0C\uD0DC\uC2A4\uD06C\uB85C \uBD84\uD574</span>}
          {ids && ids.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {ids.map((id, i) => (
                <span key={i} className="text-[10px] bg-[#252a3a] border border-[#2e3348] text-[#9198b4] px-1.5 py-0.5 rounded font-mono">{id}</span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'test_run':
    case 'workflow_test': {
      const summary = typeof payload.summary === 'object' && payload.summary ? payload.summary as Record<string, unknown> : null;
      const pass = Number(summary?.pass ?? payload.pass ?? 0);
      const fail = Number(summary?.fail ?? payload.fail ?? 0);
      const skip = Number(summary?.skip ?? payload.skip ?? 0);
      const results = Array.isArray(payload.results) ? payload.results as Record<string, unknown>[] : null;
      const runNumber = typeof payload.runNumber === 'number' ? payload.runNumber : null;

      return (
        <div className="mt-2.5">
          {runNumber != null && (
            <div className="text-[10px] font-mono font-semibold text-[#555e7a] mb-1.5 flex items-center gap-1.5">
              <span className="bg-[#252a3a] border border-[#3a4060] text-[#9198b4] px-1.5 py-0.5 rounded">{runNumber}\uCC28 \uC2E4\uD589</span>
              {fail > 0 ? (
                <span className="text-red-400">&middot; {fail}/{pass + fail + skip} \uC2E4\uD328</span>
              ) : (
                <span className="text-green-400">&middot; \uC804\uCCB4 \uD1B5\uACFC</span>
              )}
            </div>
          )}
          {/* Individual test results */}
          {results && results.length > 0 ? (
            <div className="flex flex-col gap-1">
              {results.map((r, i) => {
                const st = String(r.status ?? 'unknown');
                const isFail = st === 'fail';
                return (
                  <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${isFail ? 'border-red-500/20 bg-[#1A1D2E]' : 'border-[#2e3348] bg-[#1A1D2E]'}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isFail ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                      {isFail ? '\u2715' : '\u2713'}
                    </span>
                    <span className="text-[#9198b4] flex-1">{String(r.name ?? '')}</span>
                    {r.duration_ms != null && (
                      <span className="font-mono text-[10px] text-[#555e7a] min-w-[36px] text-right">{Number(r.duration_ms)}ms</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (pass > 0 || fail > 0) ? (
            <div className="flex gap-3 text-xs font-mono">
              <span className="text-green-400">\u2713 {pass} pass</span>
              {fail > 0 && <span className="text-red-400">\u2715 {fail} fail</span>}
              {skip > 0 && <span className="text-[#555e7a]">\u2298 {skip} skip</span>}
            </div>
          ) : null}
        </div>
      );
    }

    case 'error_detected': {
      const message = typeof payload.message === 'string' ? payload.message : null;
      const errorType = typeof payload.error_type === 'string' ? payload.error_type : null;
      const stack = typeof payload.stack === 'string' ? payload.stack : null;
      return (
        <div className="mt-2.5 bg-[#0f1117] border border-red-500/18 border-l-2 border-l-red-500 rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed">
          {errorType && <div className="text-red-400 font-semibold mb-0.5">{errorType}</div>}
          {message && <div className="text-red-400">\u2715 {message}</div>}
          {stack && <div className="text-[#555e7a] mt-1 whitespace-pre-wrap">{stack}</div>}
        </div>
      );
    }

    case 'create_fix': {
      const description = typeof payload.description === 'string' ? payload.description : null;
      const fixTaskId = typeof payload.fixTaskId === 'string' ? payload.fixTaskId : null;
      const filesChanged = Array.isArray(payload.filesChanged) ? payload.filesChanged as string[] : null;
      return (
        <div className="mt-2.5 bg-[rgba(245,146,90,0.04)] border border-[rgba(245,146,90,0.2)] border-l-[3px] border-l-[#f5925a] rounded-lg px-3.5 py-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#f5925a] mb-1.5">\uD83E\uDD16 \uC218\uC815 \uC774\uC720</div>
          {description && <div className="text-xs text-[#9198b4] leading-relaxed">{description}</div>}
          {fixTaskId && <div className="mt-1 text-[10px] text-[#555e7a]">\uC218\uC815 \uD0DC\uC2A4\uD06C: <span className="font-mono text-orange-300">{fixTaskId}</span></div>}
          {filesChanged && filesChanged.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {filesChanged.map((f, i) => (
                <span key={i} className="text-[10px] bg-[#252a3a] text-[#9198b4] px-1.5 py-0.5 rounded font-mono">{f}</span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'workflow_fix_complete': {
      const notes = typeof payload.notes === 'string' ? payload.notes : null;
      return (
        <div className="mt-2.5 bg-[rgba(62,207,142,0.04)] border border-[rgba(62,207,142,0.2)] border-l-[3px] border-l-green-400 rounded-lg px-3.5 py-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-green-400 mb-1">\u2705 \uC218\uC815 \uC644\uB8CC</div>
          {notes && <div className="text-xs text-[#9198b4]">{notes}</div>}
        </div>
      );
    }

    case 'code_change': {
      const desc = typeof payload.description === 'string' ? payload.description : null;
      const files = Array.isArray(payload.files) ? payload.files as Record<string, unknown>[] : null;
      const diffSummary = typeof payload.diff_summary === 'string' ? payload.diff_summary : null;
      return (
        <div className="mt-2.5">
          {desc && <div className="text-xs text-[#9198b4] mb-2">{desc}</div>}
          {files && files.length > 0 && (
            <div className="bg-[#0f1117] border border-[#2e3348] rounded-lg overflow-hidden">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono border-b border-[#2e3348] last:border-b-0">
                  <span className="text-[#9198b4] font-semibold flex-1">{String(f.path ?? '')}</span>
                  {f.additions != null && <span className="text-green-400">+{Number(f.additions)}</span>}
                  {f.deletions != null && <span className="text-red-400">-{Number(f.deletions)}</span>}
                </div>
              ))}
            </div>
          )}
          {diffSummary && (
            <pre className="mt-2 bg-[#0f1117] border border-[#2e3348] rounded-lg p-3 text-[11px] font-mono text-[#9198b4] leading-relaxed overflow-x-auto whitespace-pre-wrap">{diffSummary}</pre>
          )}
        </div>
      );
    }

    case 'commit_sync': {
      const hash = typeof payload.commitHash === 'string' ? payload.commitHash : null;
      const message = typeof payload.message === 'string' ? payload.message : typeof payload.notes === 'string' ? payload.notes : null;
      const additions = typeof payload.additions === 'number' ? payload.additions : null;
      const deletions = typeof payload.deletions === 'number' ? payload.deletions : null;
      const filesChanged = Array.isArray(payload.files_changed) ? payload.files_changed as string[] : null;
      return (
        <div className="mt-2.5 bg-[#1A1D2E] border border-[#2e3348] rounded-lg px-3 py-2.5 font-mono text-[11px] leading-relaxed">
          {message && <div className="text-[#f5c842] font-semibold mb-0.5">{message}</div>}
          {hash && <div className="text-[#555e7a]">{hash.slice(0, 7)}</div>}
          {(additions != null || deletions != null) && (
            <div className="text-green-400 mt-0.5">
              {additions != null && <span>+{additions}</span>}
              {deletions != null && <span className="text-red-400 ml-1">-{deletions}</span>}
              {filesChanged && <span className="text-[#555e7a] ml-1">&middot; {filesChanged.length} files changed</span>}
            </div>
          )}
        </div>
      );
    }

    case 'escalate': {
      const reason = typeof payload.reason === 'string' ? payload.reason : null;
      const attempts = typeof payload.attempts === 'number' ? payload.attempts : null;
      return (
        <div className="mt-2.5 bg-[rgba(241,107,107,0.04)] border border-[rgba(241,107,107,0.2)] border-l-[3px] border-l-red-500 rounded-lg px-3.5 py-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-1">\u26A0\uFE0F \uC5D0\uC2A4\uCEEC\uB808\uC774\uC158</div>
          {reason && <div className="text-xs text-red-200 leading-relaxed">{reason}</div>}
          {attempts != null && <div className="mt-1 text-[10px] text-red-400">{attempts}\uD68C \uC2DC\uB3C4 \uD6C4</div>}
        </div>
      );
    }

    case 'link_pr': {
      const prUrl = typeof payload.prUrl === 'string' ? payload.prUrl : null;
      if (!prUrl) return null;
      return (
        <div className="mt-2 text-xs">
          <a href={prUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 font-mono">
            PR #{prUrl.split('/').pop()}
          </a>
        </div>
      );
    }

    case 'create_issue': {
      const issueUrl = typeof payload.issueUrl === 'string' ? payload.issueUrl : null;
      const issueNumber = typeof payload.issueNumber === 'number' || typeof payload.issueNumber === 'string' ? payload.issueNumber : null;
      if (!issueUrl) return null;
      return (
        <div className="mt-2 text-xs">
          <a href={issueUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 font-mono">
            Issue #{issueNumber ?? issueUrl.split('/').pop()}
          </a>
        </div>
      );
    }

    case 'update': {
      const field = typeof payload.field === 'string' ? payload.field : null;
      if (!field) return null;
      return (
        <div className="mt-2 text-xs font-mono text-[#9198b4]">
          <span className="text-[#555e7a]">{field}:</span>{' '}
          {String(payload.from ?? '\u2014')} <span className="text-[#555e7a]">\u2192</span> {String(payload.to ?? '\u2014')}
        </div>
      );
    }

    default: {
      // Fallback: render payload as key-value
      return (
        <div className="mt-2 space-y-0.5">
          {Object.entries(payload).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="text-[#555e7a] shrink-0 font-mono">{key}:</span>
              <span className="text-[#9198b4] break-all">{typeof val === 'string' ? val : JSON.stringify(val)}</span>
            </div>
          ))}
        </div>
      );
    }
  }
}

/* ─────────────────────────────────────────────
   Stage Card (Accordion)
───────────────────────────────────────────── */
function StageCard({ stage, index, isOpen, onToggle }: {
  stage: StageGroup;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[stage.status] ?? STATUS_META.todo;
  const iconBgMap: Record<string, string> = {
    todo: 'bg-[rgba(136,145,176,0.1)]',
    in_progress: 'bg-[rgba(108,143,255,0.12)]',
    testing: 'bg-[rgba(245,200,66,0.1)]',
    fixing: 'bg-[rgba(245,146,90,0.12)]',
    review: 'bg-[rgba(108,143,255,0.12)]',
    done: 'bg-[rgba(62,207,142,0.1)]',
  };

  // Filter out status_change for display (it's shown as the transition arrow)
  const contentActivities = stage.activities.filter(a => a.action !== 'status_change');
  // status_change activities for transition display
  const statusChanges = stage.activities.filter(a => a.action === 'status_change');

  return (
    <div
      className="border border-[#2e3348] rounded-xl overflow-hidden hover:border-[#3a4060] transition-colors"
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      {/* Card Head */}
      <div
        onClick={onToggle}
        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer bg-[#1A1D2E] hover:bg-[#1E2135] transition-colors select-none"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${iconBgMap[stage.status] ?? iconBgMap.todo}`}>
          {stage.icon}
        </div>
        <span className="text-[13px] font-semibold font-mono text-[#e8ecf4]">{stage.label}</span>
        <span className="text-[10px] font-mono text-[#555e7a]">{formatTimeRange(stage.startTime, stage.endTime)}</span>
        <span className="text-[10px] font-mono text-[#555e7a] bg-[#252a3a] border border-[#2e3348] px-2 py-0.5 rounded-xl">
          {stage.status === 'done' ? '\uC644\uB8CC' : stage.durationSeconds > 0 ? formatDuration(stage.durationSeconds) : '\uC0DD\uC131'}
        </span>
        {stage.testFailCount > 0 && <Pill variant="fail">{stage.testFailCount}\uD68C \uC2E4\uD328</Pill>}
        {stage.fixCount > 0 && <Pill variant="fix">{stage.fixCount}\uD68C \uC218\uC815</Pill>}
        {stage.status === 'done' && <Pill variant="done">done</Pill>}
        {stage.status === 'testing' && stage.testFailCount === 0 && stage.passed && <Pill variant="pass">\uC804\uCCB4 \uD1B5\uACFC</Pill>}
        <span className={`text-[#555e7a] text-[10px] ml-auto shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          \u25BE
        </span>
      </div>

      {/* Card Body (collapsible) */}
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[2000px]' : 'max-h-0'}`}>
        <div className="px-4 pb-4 border-t border-[#2e3348]">
          {/* Content activities */}
          {contentActivities.map((act) => (
            <ActivityContent key={act.id} activity={act} />
          ))}

          {/* Status transition arrows */}
          {statusChanges.map((sc) => (
            <ActivityContent key={sc.id} activity={sc} />
          ))}

          {/* If no activities to show, show empty state */}
          {contentActivities.length === 0 && statusChanges.length === 0 && (
            <div className="text-xs text-[#555e7a] mt-3 font-mono">\uAE30\uB85D\uB41C \uD65C\uB3D9 \uC5C6\uC74C</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Stage Flow Bar
───────────────────────────────────────────── */
function StageFlowBar({ stages, onStageClick }: { stages: StageGroup[]; onStageClick: (index: number) => void }) {
  return (
    <div className="flex items-start gap-0 px-6 py-3.5 border-b border-[#2e3348] overflow-x-auto scrollbar-hide">
      {stages.map((stage, i) => {
        const hasFails = stage.testFailCount > 0;
        const isDone = stage.passed;
        return (
          <div key={i} className="flex items-start shrink-0">
            {i > 0 && <div className="w-6 h-px bg-green-500/30 mt-[13px] shrink-0" />}
            <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => onStageClick(i)}>
              <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-[10px] font-mono font-bold border-[1.5px] shrink-0 ${
                hasFails ? 'border-red-500 text-red-500 bg-red-500/15' : isDone ? 'border-green-500 text-green-500 bg-green-500/15' : 'border-[#3a4060] text-[#555e7a] bg-transparent'
              }`}>
                {hasFails ? '\u2715' : isDone ? '\u2713' : (i + 1)}
              </div>
              <div className="text-[9px] font-mono text-[#555e7a] whitespace-nowrap text-center leading-tight">
                {stage.label}
                {hasFails && <><br /><span className="text-red-400">\u00D7{stage.testFailCount} \uC2E4\uD328</span></>}
                {stage.fixCount > 0 && <><br /><span className="text-orange-400">\u00D7{stage.fixCount}</span></>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Modal Component
───────────────────────────────────────────── */
interface TaskModalProps {
  taskId: string;
  onClose: () => void;
}

export default function TaskModal({ taskId, onClose }: TaskModalProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [fixHistory, setFixHistory] = useState<FixHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const [taskData, historyData, activityData] = await Promise.all([
          api.getTask(taskId),
          api.getFixHistory(taskId).catch(() => null),
          api.listActivities({ task_id: taskId, limit: '100' }).catch(() => ({ activities: [] })),
        ]);
        setTask(taskData.task);
        setSubtasks(taskData.subtasks);
        setFixHistory(historyData as FixHistory | null);
        setActivities(activityData.activities as Activity[]);
        // Open all cards by default
        const stageCount = buildStageGroups(activityData.activities as Activity[], taskData.task).length;
        setOpenCards(new Set(Array.from({ length: stageCount }, (_, i) => i)));
      } catch {
        /* handled by !task check */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [taskId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const toggleCard = useCallback((index: number) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const stages = task ? buildStageGroups(activities, task) : [];

  // Compute stats
  const totalDuration = stages.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalFixes = stages.reduce((sum, s) => sum + s.fixCount, 0);
  const totalTestFails = stages.reduce((sum, s) => sum + s.testFailCount, 0);

  const statusStyle = task ? STATUS_META[task.status] ?? STATUS_META.todo : STATUS_META.todo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-[780px] max-h-[90vh] flex flex-col bg-[#171923] border border-[#2e3348] rounded-xl shadow-[0_28px_80px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#2e3348] border-t-[#6c8fff] rounded-full animate-spin" />
          </div>
        ) : !task ? (
          <div className="text-center py-20 text-red-400">\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4</div>
        ) : (
          <>
            {/* ── HEADER ── */}
            <div className="px-6 pt-5 pb-0 shrink-0">
              <div className="flex items-center gap-2.5 mb-2.5">
                {task.ticket_code && (
                  <span className="font-mono text-[13px] font-semibold text-[#9198b4] bg-[#1A1D2E] border border-[#3a4060] px-2.5 py-0.5 rounded-md">
                    {task.ticket_code}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                  task.status === 'done'
                    ? 'bg-green-500/15 text-green-400 border-green-500/25'
                    : `${statusStyle.bg} ${statusStyle.color} border-transparent`
                }`}>
                  {task.status.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-[11px] font-semibold text-[#555e7a]">P{task.priority}</span>
                <span className="text-xs text-[#555e7a]">{new Date(task.created_at).toLocaleDateString('ko-KR')}</span>
                <button
                  onClick={onClose}
                  className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-[#555e7a] hover:bg-[#1A1D2E] hover:text-[#e8ecf4] transition-colors"
                >
                  \u2715
                </button>
              </div>
              <h2 className="text-xl font-semibold text-[#e8ecf4] leading-tight tracking-tight mb-4">{task.title}</h2>
            </div>

            {/* ── META GRID ── */}
            <div className="grid grid-cols-3 gap-0 px-6 py-3.5 border-y border-[#2e3348] shrink-0">
              <MetaItem label="Assignee" value={task.assignee} />
              <MetaItem label="Created By" value={task.created_by} />
              <MetaItem label="Priority" value={`P${task.priority}`} />
              {task.completed_at && <MetaItem label="Completed" value={new Date(task.completed_at).toLocaleDateString('ko-KR')} className="mt-2.5" />}
              {totalDuration > 0 && <MetaItem label="\uC18C\uC694 \uC2DC\uAC04" value={formatDuration(totalDuration)} className="mt-2.5" />}
              {totalFixes > 0 && <MetaItem label="\uC218\uC815 \uD69F\uC218" value={`${totalFixes}\uD68C`} className="mt-2.5" highlight />}
            </div>

            {/* ── STAGE FLOW BAR ── */}
            {stages.length > 0 && (
              <StageFlowBar
                stages={stages}
                onStageClick={(i) => {
                  setOpenCards(prev => new Set(prev).add(i));
                  document.getElementById(`stage-card-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            )}

            {/* ── BODY ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 scroll-smooth" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3a4060 transparent' }}>
              {/* Description */}
              {task.description && (
                <p className="text-sm text-[#9198b4] leading-relaxed mb-5">{task.description}</p>
              )}

              {/* Subtasks */}
              {subtasks.length > 0 && (
                <div className="mb-5">
                  <div className="text-[11px] font-semibold text-[#555e7a] uppercase tracking-wider mb-2.5 flex items-center gap-2">
                    Subtasks
                    <span className="text-[10px] font-mono bg-[#252a3a] border border-[#3a4060] text-[#9198b4] px-1.5 py-0.5 rounded-xl">
                      {subtasks.filter(s => s.status === 'done').length}/{subtasks.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {subtasks.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#1A1D2E] border border-[#2e3348] rounded-md text-xs text-[#9198b4]">
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          sub.status === 'done' ? 'bg-green-500' : 'border-[1.5px] border-[#3a4060]'
                        }`}>
                          {sub.status === 'done' && (
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          )}
                        </div>
                        <span className={sub.status === 'done' ? 'text-[#555e7a] line-through' : ''}>{sub.title}</span>
                        {sub.ticket_code && <span className="ml-auto font-mono text-[9px] text-[#555e7a]">{sub.ticket_code}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stage Cards */}
              {stages.length > 0 ? (
                <>
                  <div className="text-[11px] font-semibold text-[#555e7a] uppercase tracking-wider mb-3 flex items-center gap-2">
                    \uD65C\uB3D9 \uB0B4\uC5ED
                    <span className="text-[10px] font-mono bg-[#252a3a] border border-[#3a4060] text-[#9198b4] px-1.5 py-0.5 rounded-xl">
                      {stages.length} \uB2E8\uACC4
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {stages.map((stage, i) => (
                      <div key={i} id={`stage-card-${i}`}>
                        <StageCard
                          stage={stage}
                          index={i}
                          isOpen={openCards.has(i)}
                          onToggle={() => toggleCard(i)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-xs text-[#555e7a] bg-[#1A1D2E] rounded-lg px-4 py-6 text-center">
                  \uC544\uC9C1 \uD65C\uB3D9 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4
                </div>
              )}

              {/* Test & Fix History (from fix-history API) */}
              {fixHistory && (fixHistory.testRuns.length > 0 || fixHistory.fixAttempts.length > 0) && (
                <div className="mt-5">
                  <div className="text-[11px] font-semibold text-[#555e7a] uppercase tracking-wider mb-3">Test & Fix History</div>
                  <div className="bg-[#1A1D2E] rounded-lg p-4 space-y-3 border border-[#2e3348]">
                    <div className="flex gap-4 text-xs font-mono text-[#555e7a]">
                      <span>Runs: {fixHistory.summary.totalRuns}</span>
                      <span>Fixes: {fixHistory.summary.totalFixes}</span>
                      <span>Last: {fixHistory.summary.lastResult ?? 'N/A'}</span>
                    </div>
                    {fixHistory.testRuns.slice(0, 5).map((run) => (
                      <div key={run.id} className="flex items-center gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full ${run.status === 'pass' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-[#555e7a] font-mono">#{run.run_number}</span>
                        <span className="text-[#9198b4]">{run.test_type}</span>
                        <span className={run.status === 'pass' ? 'text-green-400' : 'text-red-400'}>{run.status}</span>
                        <span className="text-[#555e7a] font-mono ml-auto text-[10px]">{new Date(run.created_at).toLocaleString('ko-KR')}</span>
                      </div>
                    ))}
                    {fixHistory.fixAttempts.map((attempt) => (
                      <div key={attempt.id} className="bg-[#252a3a] rounded-md p-3 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${attempt.result_status === 'pass' ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-[#9198b4] font-mono font-medium">Attempt #{attempt.attempt_number}</span>
                          <span className={attempt.result_status === 'pass' ? 'text-green-400' : 'text-red-400'}>{attempt.result_status}</span>
                        </div>
                        {attempt.fix_description && <p className="text-[#9198b4] ml-3.5">{attempt.fix_description}</p>}
                      </div>
                    ))}
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

/* ─────────────────────────────────────────────
   Meta Item
───────────────────────────────────────────── */
function MetaItem({ label, value, className = '', highlight = false }: { label: string; value: string; className?: string; highlight?: boolean }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#555e7a] mb-1">{label}</div>
      <div className={`text-[13px] font-medium ${highlight ? 'text-orange-400' : 'text-[#9198b4]'}`}>{value}</div>
    </div>
  );
}
