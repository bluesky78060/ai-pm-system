const BASE = '/api';
const API_KEY_STORAGE = 'aipm_api_key';

// 세션 만료(keyed 401) 시 재로그인 게이트로 복귀시키는 전역 이벤트명. 오타 방지 위해 상수화.
export const UNAUTHORIZED_EVENT = 'apikey-unauthorized';

// API 키 (localStorage). trim 후 비어있지 않은 값만 유효 — 빈/공백 키 전송 금지.
// localStorage 비가용(프라이빗 모드·스토리지 차단) 시 throw하지 않도록 방어.
export function getApiKey(): string {
	try {
		return (localStorage.getItem(API_KEY_STORAGE) ?? '').trim();
	} catch {
		return '';
	}
}
export function setApiKey(key: string): void {
	try {
		localStorage.setItem(API_KEY_STORAGE, key.trim());
	} catch {
		// 저장 실패(쿼터/차단) 무시 — 키는 이번 세션 메모리에만 존재(새로고침 시 재입력).
	}
}
export function clearApiKey(): void {
	try {
		localStorage.removeItem(API_KEY_STORAGE);
	} catch {
		// 무시
	}
}

// HTTP status가 부착된 에러 — 프로브가 401 vs 비-401(403/500/네트워크)을 구분할 수 있게 함.
export interface ApiError extends Error {
	status?: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const key = getApiKey();
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...((options?.headers as Record<string, string> | undefined) ?? {}),
	};
	if (key) headers['x-api-key'] = key; // 비어있지 않은 키만 전송

	const res = await fetch(`${BASE}${path}`, { ...options, headers });
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		// 키가 있었는데 401 = 세션 만료/무효 → 키 제거 + 전역 이벤트로 재로그인 유도.
		// 키 없는(keyless) 401은 게이트 정상 진입 상태이므로 이벤트 발화 안 함(프로브 루프 방지).
		if (res.status === 401 && key) {
			clearApiKey();
			window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
		}
		const error: ApiError = Object.assign(new Error(err.error ?? res.statusText), {
			status: res.status,
		});
		throw error;
	}
	// 빈/비-JSON 200 바디(프록시 빈 응답·204 등)에서 res.json() reject로 인증된 사용자가
	// "연결 실패"에 갇히는 것을 방지 — success 경로도 error 경로처럼 파싱을 가드한다.
	const text = await res.text();
	return (text ? JSON.parse(text) : {}) as T;
}

export interface Project {
	id: string;
	code: string | null;
	name: string;
	description: string | null;
	status: string;
	github_repo: string | null;
	created_at: string;
	updated_at: string;
}

export interface Epic {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	status: string;
	priority: number;
	order_index: number;
	seq: number | null;
	created_at: string;
	taskCount?: number;
	completedCount?: number;
	rate?: number;
}

export interface Task {
	id: string;
	epic_id: string | null;
	parent_id: string | null;
	title: string;
	description: string | null;
	status: string;
	priority: number;
	assignee: string;
	github_issue: string | null;
	github_pr: string | null;
	estimated_hrs: number | null;
	actual_hrs: number | null;
	blocked_by: string | null;
	created_by: string;
	seq: number | null;
	ticket_code: string | null;
	created_at: string;
	completed_at: string | null;
}

export interface ProjectStatus {
	project: Project;
	epics: (Epic & { taskCount: number; completedCount: number; rate: number })[];
	summary: {
		totalEpics: number;
		totalTasks: number;
		completionRate: number;
		statusBreakdown: Record<string, number>;
	};
}

export interface SessionContext {
	project: { id: string; name: string; status: string; githubRepo: string | null };
	currentTasks: { inProgress: Task[]; testing: Task[]; blocked: Task[] };
	recentlyCompleted: { tasks: Task[]; lastCompletedAt: string | null };
	progress: {
		totalTasks: number;
		completed: number;
		inProgress: number;
		blocked: number;
		completionRate: number;
		byEpic: { epicId: string; epicTitle: string; total: number; completed: number; rate: number }[];
	};
	nextRecommended: { task: Task; reason: string } | null;
}

export interface BlockingAnalysis {
	projectId: string;
	totalBlocked: number;
	criticalPath: {
		task: Task;
		blockedSince: string;
		reason: string | null;
		blockedDependents: Task[];
		suggestedAction: string;
	}[];
	delayedTasks: Task[];
	summary: string;
}

// API functions
export const api = {
	// Projects
	listProjects: () => request<{ projects: Project[] }>('/projects'),
	getProject: (id: string) => request<{ project: Project; epics: Epic[] }>(`/projects/${id}`),
	getProjectStatus: (id: string) => request<ProjectStatus>(`/projects/${id}/status`),
	getSessionContext: (id: string) => request<SessionContext>(`/projects/${id}/context`),
	getBlockingAnalysis: (id: string) => request<BlockingAnalysis>(`/projects/${id}/blocking`),
	createProject: (data: { name: string; description?: string; github_repo?: string }) =>
		request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),

	// Tasks
	listTasks: (params?: Record<string, string>) => {
		const query = params ? `?${new URLSearchParams(params)}` : '';
		return request<{ tasks: Task[] }>(`/tasks${query}`);
	},
	getTask: (id: string) => request<{ task: Task; subtasks: Task[] }>(`/tasks/${id}`),
	createTask: (data: Partial<Task> & { title: string }) =>
		request<{ task: Task; message: string }>('/tasks', {
			method: 'POST',
			body: JSON.stringify(data),
		}),
	updateTaskStatus: (id: string, status: string, notes?: string) =>
		request<{ task: Task }>(`/tasks/${id}/status`, {
			method: 'PATCH',
			body: JSON.stringify({ status, notes }),
		}),
	getFixHistory: (taskId: string) =>
		request<{ testRuns: any[]; fixAttempts: any[]; summary: any }>(`/tasks/${taskId}/fix-history`),
	searchTasks: (
		query: string,
		filters?: {
			status?: string[];
			assignee?: string[];
			epic_id?: string[];
			priority?: number[];
			date_range?: { start: string; end: string };
		},
	) =>
		request<{ tasks: Task[] }>('/tasks/search', {
			method: 'POST',
			body: JSON.stringify({ query, filters }),
		}),

	// Saved Searches
	saveSearch: (userId: string, name: string, query: string, filters?: any) =>
		request<{
			id: string;
			user_id: string;
			name: string;
			query: string;
			filters?: any;
			created_at: string;
		}>('/saved-searches', {
			method: 'POST',
			body: JSON.stringify({ user_id: userId, name, query, filters }),
		}),
	getSavedSearches: (userId: string) =>
		request<{
			saved_searches: {
				id: string;
				user_id: string;
				name: string;
				query: string;
				filters?: any;
				created_at: string;
			}[];
		}>(`/saved-searches?user_id=${userId}`),
	deleteSavedSearch: (id: string) =>
		request<{ message: string }>(`/saved-searches/${id}`, { method: 'DELETE' }),

	// Activities
	listActivities: (params?: Record<string, string>) => {
		const query = params ? `?${new URLSearchParams(params)}` : '';
		return request<{ activities: any[] }>(`/activities${query}`);
	},
	listProjectActivities: (projectId: string, params?: Record<string, string>) => {
		const query = params ? `?${new URLSearchParams(params)}` : '';
		return request<{ activities: any[] }>(`/projects/${projectId}/activities${query}`);
	},
};
