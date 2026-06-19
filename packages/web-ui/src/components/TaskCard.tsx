import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../api';

const PRIORITY_CONFIG: Record<number, { label: string; bg: string; text: string }> = {
	1: { label: 'P1', bg: 'bg-red-900/60', text: 'text-red-300' },
	2: { label: 'P2', bg: 'bg-amber-900/60', text: 'text-amber-300' },
	3: { label: 'P3', bg: 'bg-blue-900/40', text: 'text-blue-300' },
	4: { label: 'P4', bg: 'bg-slate-700/60', text: 'text-slate-300' },
	5: { label: 'P5', bg: 'bg-slate-800/60', text: 'text-slate-400' },
};

/** 상태별 왼쪽 스트라이프 색상 (hex) */
const STATUS_STRIPE: Record<string, string> = {
	todo: '#6366f1', // indigo
	in_progress: '#f59e0b', // amber
	testing: '#8b5cf6', // violet
	fixing: '#f97316', // orange
	review: '#06b6d4', // cyan
	done: '#22c55e', // green
	blocked: '#ef4444', // red
};

/** 에픽별 색상 팔레트 (배경 + 텍스트) */
export const EPIC_COLOR_PALETTE = [
	{ bg: 'rgba(96,165,250,0.15)', text: '#60a5fa', dot: '#60a5fa' }, // blue
	{ bg: 'rgba(167,139,250,0.15)', text: '#a78bfa', dot: '#a78bfa' }, // violet
	{ bg: 'rgba(52,211,153,0.15)', text: '#34d399', dot: '#34d399' }, // emerald
	{ bg: 'rgba(251,113,133,0.15)', text: '#fb7185', dot: '#fb7185' }, // rose
	{ bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', dot: '#fbbf24' }, // amber
	{ bg: 'rgba(34,211,238,0.15)', text: '#22d3ee', dot: '#22d3ee' }, // cyan
	{ bg: 'rgba(244,114,182,0.15)', text: '#f472b6', dot: '#f472b6' }, // pink
	{ bg: 'rgba(163,230,53,0.15)', text: '#a3e635', dot: '#a3e635' }, // lime
];

export interface EpicColorInfo {
	bg: string;
	text: string;
	dot: string;
}

interface TaskCardProps {
	task: Task;
	epicTitle?: string;
	epicColor?: EpicColorInfo;
	subtaskInfo?: { completed: number; total: number };
	onClick?: (taskId: string) => void;
}

export default function TaskCard({
	task,
	epicTitle,
	epicColor,
	subtaskInfo,
	onClick,
}: TaskCardProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: task.id,
	});

	const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG[3];
	const stripeColor = STATUS_STRIPE[task.status] ?? '#334155';
	const isDone = task.status === 'done';
	const isBlocked = task.status === 'blocked';

	// 에픽 색상을 카드 배경 틴트로 사용 (더 은은하게)
	const cardBg = epicColor ? epicColor.bg.replace('0.15', '0.06') : undefined;
	const cardHoverBg = epicColor ? epicColor.bg.replace('0.15', '0.12') : undefined;

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		backgroundColor: cardBg ?? '#1A1D2E',
		borderColor: epicColor ? `${epicColor.dot}20` : '#2e3348',
		cursor: isDragging ? 'grabbing' : 'grab',
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			onClick={() => onClick?.(task.id)}
			className={`relative block rounded-lg border overflow-hidden transition-all ${isDone ? 'opacity-65' : ''} ${isDragging ? 'shadow-2xl scale-105 z-50' : ''}`}
			onMouseEnter={(e) => {
				if (!isDragging) {
					e.currentTarget.style.backgroundColor = cardHoverBg ?? '#1E2135';
					e.currentTarget.style.borderColor = epicColor ? `${epicColor.dot}40` : '#3d4463';
				}
			}}
			onMouseLeave={(e) => {
				if (!isDragging) {
					e.currentTarget.style.backgroundColor = cardBg ?? '#1A1D2E';
					e.currentTarget.style.borderColor = epicColor ? `${epicColor.dot}20` : '#2e3348';
				}
			}}
		>
			{/* 상태별 왼쪽 스트라이프 */}
			<div
				className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-lg"
				style={{ backgroundColor: stripeColor }}
			/>

			<div className="pl-3.5 pr-3 py-3">
				{/* Top row: Ticket Code + Epic + Priority */}
				<div className="flex items-center justify-between mb-2">
					<div className="flex items-center gap-1.5">
						{task.ticket_code && (
							<span
								className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
								style={
									epicColor
										? {
												backgroundColor: epicColor.bg.replace('0.15', '0.25'),
												color: epicColor.text,
											}
										: { backgroundColor: 'rgba(99,102,241,0.25)', color: '#818cf8' }
								}
							>
								{task.ticket_code}
							</span>
						)}
						{epicTitle && epicColor && (
							<span
								className="text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1"
								style={{ backgroundColor: epicColor.bg, color: epicColor.text }}
							>
								<span
									className="w-1.5 h-1.5 rounded-full shrink-0"
									style={{ backgroundColor: epicColor.dot }}
								/>
								{epicTitle}
							</span>
						)}
					</div>
					{isDone ? (
						<svg
							className="w-4 h-4 text-green-500"
							aria-hidden="true"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					) : (
						<span
							className={`text-[10px] font-semibold px-2 py-0.5 rounded ${priority.bg} ${priority.text}`}
						>
							{priority.label}
						</span>
					)}
				</div>

				{/* Title */}
				<p
					className={`text-[13px] font-medium mb-2 ${isDone ? 'text-slate-400 line-through' : 'text-slate-200'}`}
				>
					{task.title}
				</p>

				{/* Blocked warning */}
				{isBlocked && task.blocked_by && (
					<div className="flex items-center gap-1.5 bg-red-900/50 rounded px-2.5 py-1.5 mb-2">
						<svg
							className="w-3.5 h-3.5 text-red-300 shrink-0"
							aria-hidden="true"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
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
					) : (
						<span />
					)}
					<span className={`text-[11px] ${isDone ? 'text-slate-600' : 'text-slate-500'}`}>
						{new Date(task.created_at).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric',
						})}
					</span>
				</div>
			</div>
		</div>
	);
}
