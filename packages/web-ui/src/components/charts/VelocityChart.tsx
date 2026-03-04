import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useEffect, useState } from 'react';
import { api } from '../../api';

interface VelocityChartProps {
  projectId: string;
}

interface VelocityDataPoint {
  date: string;
  completed: number;
  total: number;
}

export default function VelocityChart({ projectId }: VelocityChartProps) {
  const [data, setData] = useState<VelocityDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVelocity() {
      try {
        // Fetch activity data and aggregate by day
        const { activities } = await api.listProjectActivities(projectId, { limit: '100' });

        const dailyStats = new Map<string, { completed: number; total: number }>();

        // Process activities to count completions per day
        for (const activity of activities) {
          if (activity.action === 'completed') {
            const date = new Date(activity.timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });

            const stats = dailyStats.get(date) || { completed: 0, total: 0 };
            stats.completed += 1;
            dailyStats.set(date, stats);
          }
        }

        // Convert to array and calculate cumulative totals
        const sortedData = Array.from(dailyStats.entries())
          .map(([date, stats]) => ({ date, ...stats }))
          .reverse()
          .slice(0, 14) // Last 14 days
          .reverse();

        // Calculate cumulative
        let cumulative = 0;
        const cumulativeData = sortedData.map(point => {
          cumulative += point.completed;
          return { ...point, total: cumulative };
        });

        setData(cumulativeData);
      } catch (err) {
        console.error('Failed to load velocity data:', err);
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    loadVelocity();
    const interval = setInterval(loadVelocity, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading velocity data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No completion data yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Completion Velocity
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1f2937"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '12px',
            }}
            labelStyle={{ color: '#f9fafb', fontWeight: 600, marginBottom: '6px' }}
            itemStyle={{ color: '#d1d5db', fontSize: '13px' }}
            formatter={(value: number | undefined, name: string | undefined) => {
              const val = value ?? 0;
              if (name === 'completed') return [val, 'Tasks Completed'];
              if (name === 'total') return [val, 'Cumulative Total'];
              return [val, name];
            }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#10b981"
            strokeWidth={3}
            fill="url(#velocityGradient)"
            dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#111827' }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: '#111827' }}
          />
          <Line
            type="monotone"
            dataKey="completed"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 3 }}
            strokeDasharray="5 5"
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-6 text-xs text-gray-400 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-gradient-to-r from-emerald-500/30 to-emerald-500" />
          <span>Cumulative</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 border-t-2 border-dashed border-blue-500" />
          <span>Daily</span>
        </div>
      </div>
    </div>
  );
}
