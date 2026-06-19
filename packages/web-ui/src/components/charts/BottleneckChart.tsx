import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface BottleneckChartProps {
	statusBreakdown: Record<string, number>;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
	todo: { color: '#6b7280', label: 'To Do' },
	in_progress: { color: '#3b82f6', label: 'In Progress' },
	testing: { color: '#f59e0b', label: 'Testing' },
	fixing: { color: '#f97316', label: 'Fixing' },
	review: { color: '#8b5cf6', label: 'Review' },
	done: { color: '#10b981', label: 'Done' },
	blocked: { color: '#ef4444', label: 'Blocked' },
};

export default function BottleneckChart({ statusBreakdown }: BottleneckChartProps) {
	const chartData = Object.entries(statusBreakdown)
		.filter(([_, count]) => count > 0)
		.map(([status, count]) => ({
			name: STATUS_CONFIG[status]?.label || status,
			value: count,
			color: STATUS_CONFIG[status]?.color || '#6b7280',
		}));

	if (chartData.length === 0) {
		return <div className="flex items-center justify-center h-64 text-gray-500">No tasks yet</div>;
	}

	const totalTasks = chartData.reduce((sum, item) => sum + item.value, 0);

	return (
		<div className="space-y-2">
			<h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
				Task Distribution
			</h3>
			<ResponsiveContainer width="100%" height={280}>
				<PieChart>
					<Pie
						data={chartData}
						cx="50%"
						cy="50%"
						labelLine={false}
						label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
						outerRadius={90}
						innerRadius={50}
						fill="#8884d8"
						dataKey="value"
						paddingAngle={2}
					>
						{chartData.map((entry, index) => (
							<Cell key={`cell-${index}`} fill={entry.color} stroke="#111827" strokeWidth={2} />
						))}
					</Pie>
					<Tooltip
						contentStyle={{
							backgroundColor: '#111827',
							border: '1px solid #374151',
							borderRadius: '8px',
							padding: '12px',
						}}
						itemStyle={{ color: '#d1d5db', fontSize: '13px', fontWeight: 500 }}
						formatter={(value: number | undefined) => {
							const val = value ?? 0;
							return [`${val} tasks (${((val / totalTasks) * 100).toFixed(1)}%)`, ''];
						}}
					/>
					<Legend
						verticalAlign="bottom"
						height={36}
						iconType="circle"
						wrapperStyle={{
							paddingTop: '20px',
							fontSize: '12px',
							fontWeight: 600,
						}}
						formatter={(value) => <span style={{ color: '#d1d5db' }}>{value}</span>}
					/>
				</PieChart>
			</ResponsiveContainer>
		</div>
	);
}
