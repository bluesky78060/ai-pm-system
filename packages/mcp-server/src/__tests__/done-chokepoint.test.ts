import { describe, expect, it, vi } from 'vitest';

// APS-5-13(보안 MAJOR-1) — done chokepoint 불변식 회귀 테스트.
//
// 불변식: done으로 가는 review→done 전환은 task-service.updateStatus의 WORKFLOW_ONLY 가드로
// bypassGuard 없이는 거부된다. 따라서 CI 게이트(approveReview, 유일 bypassGuard done-path)를
// 우회하는 REST 직접 done 경로가 존재하지 않는다. 이 파일은 그 가드가 깨지지 않도록 못박는다.
//
// 별도 파일인 이유: ci-gate.test.ts는 top-level vi.mock('../services/task-service.js')로 TaskService를
// 스텁하므로, 실제 가드 로직(WORKFLOW_ONLY)을 검증하려면 모킹되지 않은 컨텍스트가 필요하다.

vi.mock('../db/repositories/task-repo.js', () => ({
	TaskRepository: class {
		findById = vi
			.fn()
			.mockResolvedValue({ id: 't1', status: 'review', title: 'T', created_at: new Date() });
		findByTicketCode = vi
			.fn()
			.mockResolvedValue({ id: 't1', status: 'review', title: 'T', created_at: new Date() });
		updateStatus = vi.fn();
	},
}));
vi.mock('../db/repositories/activity-repo.js', () => ({
	ActivityRepository: class {
		create = vi.fn();
		findByTask = vi.fn().mockResolvedValue([]);
	},
}));
vi.mock('../db/repositories/epic-repo.js', () => ({
	EpicRepository: class {
		findById = vi.fn().mockResolvedValue(null);
	},
}));
vi.mock('../services/time-tracking-service.js', () => ({
	TimeTrackingService: class {
		startTracking = vi.fn();
		stopTracking = vi.fn();
	},
}));
vi.mock('../services/notification-service.js', () => ({
	notificationService: { notify: vi.fn() },
}));

describe('done chokepoint 불변식: REST review→done은 WORKFLOW_ONLY 차단 (보안 MAJOR-1)', () => {
	it('bypassGuard 없는 review→done updateStatus는 거부된다', async () => {
		const { TaskService } = await import('../services/task-service.js');
		const svc = new TaskService();
		// bypassGuard 미지정 → review→done은 WORKFLOW_ONLY로 throw (CI 게이트 우회 방지).
		// 이 throw가 사라지면 approveReview의 CI 게이트를 우회하는 done 경로가 생기므로 불변식 위반.
		await expect(svc.updateStatus('t1', 'done')).rejects.toThrow(/smart_workflow/);
	});
});
