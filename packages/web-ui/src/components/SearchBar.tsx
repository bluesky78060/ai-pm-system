import { useState } from 'react';
import { api, type Task } from '../api';

interface SearchFilters {
  status?: string[];
  assignee?: string[];
  epic_id?: string[];
  priority?: number[];
  date_range?: { start: string; end: string };
}

interface SearchBarProps {
  onSearchResults?: (tasks: Task[]) => void;
  epics?: { id: string; title: string }[];
}

export default function SearchBar({ onSearchResults, epics = [] }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.searchTasks(query, filters);
      onSearchResults?.(result.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSearch = async () => {
    if (!saveName.trim()) {
      alert('검색 이름을 입력하세요');
      return;
    }
    try {
      await api.saveSearch('default-user', saveName, query, filters);
      alert('검색이 저장되었습니다');
      setSaveName('');
      setShowSaveDialog(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패');
    }
  };

  const toggleFilter = (key: keyof SearchFilters, value: string | number) => {
    const current = (filters[key] as any[]) || [];
    const updated = current.includes(value)
      ? current.filter((v: any) => v !== value)
      : [...current, value];
    setFilters({ ...filters, [key]: updated.length > 0 ? updated : undefined });
  };

  const isSelected = (key: keyof SearchFilters, value: string | number): boolean => {
    const current = (filters[key] as any[]) || [];
    return current.includes(value);
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
      {/* Search Input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="태스크 제목 또는 설명 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          {loading ? '검색 중...' : '검색'}
        </button>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded font-medium transition-colors"
        >
          {showAdvanced ? '간단히' : '고급'}
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-700 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="space-y-3 border-t border-slate-700 pt-3">
          {/* Status Filter */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">상태</label>
            <div className="flex flex-wrap gap-2">
              {['todo', 'in_progress', 'testing', 'fixing', 'review', 'done', 'blocked'].map((status) => (
                <button
                  key={status}
                  onClick={() => toggleFilter('status', status)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    isSelected('status', status)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">우선순위</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((priority) => (
                <button
                  key={priority}
                  onClick={() => toggleFilter('priority', priority)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    isSelected('priority', priority)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  P{priority}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee Filter */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">담당자</label>
            <div className="flex gap-2">
              {['ai', 'human'].map((assignee) => (
                <button
                  key={assignee}
                  onClick={() => toggleFilter('assignee', assignee)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    isSelected('assignee', assignee)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {assignee}
                </button>
              ))}
            </div>
          </div>

          {/* Epic Filter */}
          {epics.length > 0 && (
            <div>
              <label className="block text-slate-400 text-sm mb-2">에픽</label>
              <div className="flex flex-wrap gap-2">
                {epics.map((epic) => (
                  <button
                    key={epic.id}
                    onClick={() => toggleFilter('epic_id', epic.id)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      isSelected('epic_id', epic.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {epic.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date Range */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">날짜 범위</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={filters.date_range?.start || ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    date_range: { ...filters.date_range, start: e.target.value, end: filters.date_range?.end || '' },
                  })
                }
                className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400 self-center">~</span>
              <input
                type="date"
                value={filters.date_range?.end || ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    date_range: { start: filters.date_range?.start || '', end: e.target.value },
                  })
                }
                className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setFilters({})}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded text-sm transition-colors"
            >
              필터 초기화
            </button>
            <button
              onClick={() => setShowSaveDialog(!showSaveDialog)}
              className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              검색 저장
            </button>
          </div>

          {/* Save Dialog */}
          {showSaveDialog && (
            <div className="bg-slate-700/50 border border-slate-600 rounded p-3 space-y-2">
              <input
                type="text"
                placeholder="검색 이름"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveSearch}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveName('');
                  }}
                  className="bg-slate-600 hover:bg-slate-500 text-slate-200 px-4 py-2 rounded text-sm transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
