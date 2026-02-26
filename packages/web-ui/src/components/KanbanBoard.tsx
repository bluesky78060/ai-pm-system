import { useState } from 'react';
import type { Task, Epic } from '../api';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';

interface KanbanBoardProps {
  tasks: Task[];
  epics: Epic[];
}

type StatusKey = 'todo' | 'in_progress' | 'testing' | 'fixing' | 'review' | 'done' | 'blocked';

interface ColumnDef {
  key: string;
  statuses: StatusKey[];
  label: string;
  dotColor: string;
  group: string;
  groupStart: boolean;
  groupEnd: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'todo',        statuses: ['todo'],               label: 'Todo',        dotColor: 'bg-indigo-500', group: 'BACKLOG',  groupStart: true,  groupEnd: true },
  { key: 'in_progress', statuses: ['in_progress'],        label: 'In Progress', dotColor: 'bg-amber-500',  group: 'ACTIVE',   groupStart: true,  groupEnd: false },
  { key: 'verifying',   statuses: ['testing', 'fixing'],  label: 'Verifying',   dotColor: 'bg-violet-500', group: 'ACTIVE',   groupStart: false, groupEnd: true },
  { key: 'review',      statuses: ['review'],             label: 'Review',      dotColor: 'bg-cyan-500',   group: 'REVIEW',   groupStart: true,  groupEnd: true },
  { key: 'done',        statuses: ['done'],               label: 'Done',        dotColor: 'bg-green-500',  group: 'COMPLETE', groupStart: true,  groupEnd: false },
  { key: 'blocked',     statuses: ['blocked'],            label: 'Blocked',     dotColor: 'bg-red-500',    group: 'COMPLETE', groupStart: false, groupEnd: true },
];

const EPIC_COLORS = [
  'text-blue-400',
  'text-violet-400',
  'text-emerald-400',
  'text-rose-400',
  'text-amber-400',
  'text-cyan-400',
];

export default function KanbanBoard({ tasks, epics }: KanbanBoardProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const epicMap = new Map(epics.map((e, i) => [e.id, { title: e.title, color: EPIC_COLORS[i % EPIC_COLORS.length] }]));

  const tasksByStatus = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const status = task.status || 'todo';
    if (!acc[status]) acc[status] = [];
    acc[status].push(task);
    return acc;
  }, {});

  for (const status of Object.keys(tasksByStatus)) {
    tasksByStatus[status].sort((a, b) => a.priority - b.priority);
  }

  return (
    <div className="h-[calc(100vh-220px)] overflow-x-auto">
      {/* Group labels row */}
      <div className="flex gap-0 mb-1">
        {COLUMNS.map((col, i) => (
          <div key={col.key} className="flex-1 min-w-[160px] flex items-center">
            {col.groupStart && (
              <span className="text-[10px] font-semibold text-slate-500 tracking-[1.5px] px-1">
                {col.group}
              </span>
            )}
            {/* Divider between groups */}
            {col.groupEnd && i < COLUMNS.length - 1 && COLUMNS[i + 1].groupStart && (
              <div className="ml-auto w-px h-3 bg-slate-700" />
            )}
          </div>
        ))}
      </div>

      {/* Columns */}
      <div className="flex gap-3 h-[calc(100%-24px)]">
        {COLUMNS.map((col, i) => {
          const colTasks = col.statuses.flatMap(s => tasksByStatus[s] || []);
          const showDivider = col.groupEnd && i < COLUMNS.length - 1 && COLUMNS[i + 1].groupStart;

          return (
            <div key={col.key} className="flex-1 min-w-[160px] flex">
              <div className="flex-1 flex flex-col min-w-0">
                {/* Column header */}
                <div className="flex items-center justify-between bg-[#161822] rounded-lg px-3.5 py-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                    <span className="text-[13px] font-semibold text-slate-200">
                      {col.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 bg-[#1E2030] px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {colTasks.map((task) => {
                    const epic = task.epic_id ? epicMap.get(task.epic_id) : undefined;
                    return (
                      <TaskCard
                        key={task.id}
                        task={task}
                        epicTitle={epic?.title}
                        epicColor={epic?.color}
                        onClick={setSelectedTaskId}
                      />
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className="text-center text-[11px] text-slate-600 py-8">
                      No tasks
                    </div>
                  )}
                </div>
              </div>

              {/* Group divider */}
              {showDivider && (
                <div className="w-px bg-slate-700/50 mx-1.5 my-2 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskModal taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </div>
  );
}
