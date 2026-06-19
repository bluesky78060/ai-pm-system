export interface CreateProjectInput {
	name: string;
	description?: string;
	github_repo?: string;
}

export interface CreateEpicInput {
	project_id: string;
	title: string;
	description?: string;
	priority?: number;
}

export interface CreateTaskInput {
	title: string;
	project_id: string;
	epic_id?: string;
	description?: string;
	priority?: number;
	assignee?: string;
	parent_id?: string;
}

export interface DecomposeTaskInput {
	task_id: string;
	subtasks: {
		title: string;
		description?: string;
		priority?: number;
		estimated_hrs?: number;
	}[];
}

export interface UpdateTaskStatusInput {
	task_id: string;
	status: string;
	notes?: string;
}

export interface SetPriorityInput {
	task_id: string;
	priority: number;
	reason: string;
}

export interface AddDependencyInput {
	task_id: string;
	depends_on_id: string;
}
