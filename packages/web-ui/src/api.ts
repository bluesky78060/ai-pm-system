const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...options,
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(err.error ?? res.statusText);
	}
	return res.json();
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
