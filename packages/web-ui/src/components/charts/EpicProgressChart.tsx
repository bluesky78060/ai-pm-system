import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Epic } from '../../api';

interface EpicProgressChartProps {
  epics: (Epic & { taskCount: number; completedCount: number; rate: number })[];
}

const EPIC_COLORS = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
];

export default function EpicProgressChart({ epics }: EpicProgressChartProps) {
  const chartData = epics
    .filter(e => e.taskCount > 0)
    .map((epic, idx) => ({
      name: epic.seq ? `E${epic.seq}` : epic.title.slice(0, 12),
      fullTitle: epic.title,
      progress: Math.round(epic.rate),
      completed: epic.completedCount,
      total: epic.taskCount,
      color: EPIC_COLORS[idx % EPIC_COLORS.length],
    }))
    .slice(0, 8); // Limit to 8 epics for clarity

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No epics with tasks yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Epic Progress
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1f2937"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 600 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '12px',
            }}
            labelStyle={{ color: '#f9fafb', fontWeight: 600, marginBottom: '4px' }}
            itemStyle={{ color: '#d1d5db', fontSize: '13px' }}
            cursor={{ fill: '#1f2937', opacity: 0.3 }}
            formatter={(value: number | undefined, name: string | undefined, props: any) => {
              const val = value ?? 0;
              if (name === 'progress') {
                return [
                  `${val}% (${props.payload.completed}/${props.payload.total} tasks)`,
                  props.payload.fullTitle,
                ];
              }
              return [val, name];
            }}
          />
          <Bar dataKey="progress" radius={[6, 6, 0, 0]} maxBarSize={60}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
