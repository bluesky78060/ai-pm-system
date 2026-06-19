import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useState } from 'react';
import type { Epic, Task } from '../api';
import { api } from '../api';
import TaskCard, { EPIC_COLOR_PALETTE, type EpicColorInfo } from './TaskCard';
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
	color: string; // hex color for dot + header tint
	group: string;
	groupStart: boolean;
	groupEnd: boolean;
}

const COLUMNS: ColumnDef[] = [
	{
		key: 'todo',
		statuses: ['todo'],
		label: 'Todo',
		color: '#6366f1',
		group: 'BACKLOG',
		groupStart: true,
		groupEnd: true,
	},
	{
		key: 'in_progress',
		statuses: ['in_progress'],
		label: 'In Progress',
		color: '#f59e0b',
		group: 'ACTIVE',
		groupStart: true,
		groupEnd: false,
	},
	{
		key: 'verifying',
		statuses: ['testing', 'fixing'],
		label: 'Verifying',
		color: '#8b5cf6',
		group: 'ACTIVE',
		groupStart: false,
		groupEnd: true,
	},
	{
		key: 'review',
		statuses: ['review'],
		label: 'Review',
		color: '#06b6d4',
		group: 'REVIEW',
		groupStart: true,
		groupEnd: true,
	},
	{
		key: 'done',
		statuses: ['done', 'blocked'],
		label: 'Done',
		color: '#22c55e',
		group: 'COMPLETE',
		groupStart: true,
		groupEnd: true,
	},
];

// Map column keys to status values for API calls
const COLUMN_TO_STATUS: Record<string, string> = {
	todo: 'todo',
	in_progress: 'in_progress',
	verifying: 'testing', // verifying column maps to 'testing' status
	review: 'review',
	done: 'done',
};

function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function KanbanBoard({ tasks, epics }: KanbanBoardProps) {
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isUpdating, setIsUpdating] = useState(false);

	const epicMap = new Map(
		epics.map((e, i) => [
			e.id,
			{ title: e.title, color: EPIC_COLOR_PALETTE[i % EPIC_COLOR_PALETTE.length] },
		]),
	);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
	);

	// Update local tasks when props change
	useEffect(() => {
		setLocalTasks(tasks);
	}, [tasks]);

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);

		if (!over) return;

		const taskId = active.id as string;
		const overId = over.id as string;

		// Find which column the task was dropped into
		const targetColumn = COLUMNS.find(
			(col) =>
				overId === col.key ||
				localTasks.some((t) => t.id === overId && col.statuses.includes(t.status as StatusKey)),
		);

		if (!targetColumn) return;

		const task = localTasks.find((t) => t.id === taskId);
		if (!task) return;

		// Check if task is already in the target column
		if (targetColumn.statuses.includes(task.status as StatusKey)) return;

		const newStatus = COLUMN_TO_STATUS[targetColumn.key];
		if (!newStatus) return;

		// Optimistic update
		setLocalTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

		setIsUpdating(true);

		try {
			await api.updateTaskStatus(taskId, newStatus);
		} catch (error) {
			// Rollback on error
			setLocalTasks(tasks);
			alert(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setIsUpdating(false);
		}
	};

	const tasksByStatus = localTasks.reduce<Record<string, Task[]>>((acc, task) => {
		const status = task.status || 'todo';
		if (!acc[status]) acc[status] = [];
		acc[status].push(task);
		return acc;
	}, {});

	for (const status of Object.keys(tasksByStatus)) {
		if (status === 'done') {
			// Done: 완료 시간 역순 (최근 완료가 위)
			tasksByStatus[status].sort((a, b) => {
				const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
				const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
				return bTime - aTime;
			});
		} else {
			// 나머지: priority → seq 순
			tasksByStatus[status].sort((a, b) => {
				if (a.priority !== b.priority) return a.priority - b.priority;
				return (a.seq ?? 0) - (b.seq ?? 0);
			});
		}
	}

	const activeTask = activeId ? localTasks.find((t) => t.id === activeId) : null;
	const activeEpic = activeTask?.epic_id ? epicMap.get(activeTask.epic_id) : undefined;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className="h-[calc(100vh-220px)] overflow-x-auto relative">
				{isUpdating && (
					<div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 shadow-lg z-50">
						<div className="flex items-center gap-2">
							<div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
							<span className="text-sm text-slate-300">Updating task...</span>
						</div>
					</div>
				)}

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
						const colTasks = col.statuses.flatMap((s) => tasksByStatus[s] || []);
						const showDivider = col.groupEnd && i < COLUMNS.length - 1 && COLUMNS[i + 1].groupStart;

						return (
							<div key={col.key} className="flex-1 min-w-[160px] flex">
								<div className="flex-1 flex flex-col min-w-0">
									{/* Column header */}
									<div
										className="flex items-center justify-between rounded-lg px-3.5 py-2.5 mb-3 border"
										style={{
											background: `linear-gradient(135deg, ${hexToRgba(col.color, 0.15)} 0%, ${hexToRgba(col.color, 0.05)} 100%)`,
											borderColor: hexToRgba(col.color, 0.25),
										}}
									>
										<div className="flex items-center gap-2">
											<span
												className="w-2.5 h-2.5 rounded-full"
												style={{ backgroundColor: col.color }}
											/>
											<span className="text-[13px] font-semibold text-slate-200">{col.label}</span>
										</div>
										<span
											className="text-[11px] font-bold px-2 py-0.5 rounded-full"
											style={{
												backgroundColor: hexToRgba(col.color, 0.2),
												color: col.color,
											}}
										>
											{colTasks.length}
										</span>
									</div>

									{/* Cards */}
									<SortableContext
										items={colTasks.map((t) => t.id)}
										strategy={verticalListSortingStrategy}
										id={col.key}
									>
										<div
											className={`flex-1 overflow-y-auto space-y-3 pr-1 rounded-lg transition-all ${
												activeId &&
												!col.statuses.includes(
													(localTasks.find((t) => t.id === activeId)?.status as StatusKey) ||
														'todo',
												)
													? 'ring-2 ring-offset-2 ring-offset-slate-900'
													: ''
											}`}
											style={{
												borderColor:
													activeId &&
													!col.statuses.includes(
														(localTasks.find((t) => t.id === activeId)?.status as StatusKey) ||
															'todo',
													)
														? col.color
														: 'transparent',
											}}
										>
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
												<div className="text-center text-[11px] text-slate-600 py-8">No tasks</div>
											)}
										</div>
									</SortableContext>
								</div>

								{/* Group divider */}
								{showDivider && <div className="w-px bg-slate-700/50 mx-1.5 my-2 shrink-0" />}
							</div>
						);
					})}
				</div>

				{/* Task Detail Modal */}
				{selectedTaskId && (
					<TaskModal taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
				)}
			</div>

			{/* Drag Overlay */}
			<DragOverlay>
				{activeId && activeTask ? (
					<div className="transform rotate-3">
						<TaskCard
							task={activeTask}
							epicTitle={activeEpic?.title}
							epicColor={activeEpic?.color}
						/>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
