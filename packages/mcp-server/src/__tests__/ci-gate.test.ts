import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CiAggregationInput, aggregateCiStatus } from '../services/github-service.js';
import { matchesCiGateFlag } from '../services/workflow-service.js';

// APS-5-13: CI 게이트 단위 테스트.
// aggregateCiStatus / matchesCiGateFlag는 순수 함수(octokit/DB 비의존)라 격리 단위 테스트 가능.
// approveReview 게이트(회귀 0 / PR없음 차단 / green 통과)는 repos·GitHubService를 vi.mock으로 스텁.

const run = (
	conclusion: string | null,
	status: string | null = 'completed',
	name = 'check',
): CiAggregationInput['checkRuns'][number] => ({ name, status, conclusion });

describe('aggregateCiStatus (APS-5-13 MAJOR-4 UNION 집계)', () => {
	it('전부 success → success', () => {
		const r = aggregateCiStatus({
			checkRuns: [run('success'), run('success', 'completed', 'lint')],
			combined: null,
		});
		expect(r.state).toBe('success');
		expect(r.failedChecks).toEqual([]);
	});

	it('neutral/skipped도 success로 취급', () => {
		const r = aggregateCiStatus({
			checkRuns: [run('neutral'), run('skipped')],
			combined: null,
		});
		expect(r.state).toBe('success');
	});

	it('한 항목이라도 failure → failure (실패 체크명 포함)', () => {
		const r = aggregateCiStatus({
			checkRuns: [run('success'), run('failure', 'completed', 'build')],
			combined: null,
		});
		expect(r.state).toBe('failure');
		expect(r.failedChecks).toContain('build');
	});

	it('cancelled/timed_out/action_required/stale도 failure', () => {
		for (const c of ['cancelled', 'timed_out', 'action_required', 'stale']) {
			const r = aggregateCiStatus({ checkRuns: [run(c)], combined: null });
			expect(r.state).toBe('failure');
		}
	});

	it('미완(conclusion=null 또는 in_progress) → pending', () => {
		expect(aggregateCiStatus({ checkRuns: [run(null, 'in_progress')], combined: null }).state).toBe(
			'pending',
		);
		expect(aggregateCiStatus({ checkRuns: [run(null, 'queued')], combined: null }).state).toBe(
			'pending',
		);
	});

	it('failure가 pending보다 우선', () => {
		const r = aggregateCiStatus({
			checkRuns: [run(null, 'in_progress'), run('failure', 'completed', 'test')],
			combined: null,
		});
		expect(r.state).toBe('failure');
	});

	it('두 소스 모두 0개 → none (freshlyPushed 아님)', () => {
		const r = aggregateCiStatus({ checkRuns: [], combined: null });
		expect(r.state).toBe('none');
		expect(r.total).toBe(0);
	});

	it('combined=null이 아니어도 total_count 0이면 빈 소스로 중립 → checks만 0이면 none', () => {
		const r = aggregateCiStatus({
			checkRuns: [],
			combined: { state: 'pending', total_count: 0 },
		});
		expect(r.state).toBe('none');
	});

	// MAJOR-4 핵심 회귀: Actions-only repo는 combined-status가 비어 state:'pending'을 반환.
	// checks=green이면 빈 combined를 중립화해 success여야 한다(pending 강제 금지).
	it('MAJOR-4: checks=green + combined(state=pending,total_count=0) → success (combined 빈→pending 강제 안 함)', () => {
		const r = aggregateCiStatus({
			checkRuns: [run('success'), run('success', 'completed', 'lint')],
			combined: { state: 'pending', total_count: 0 },
		});
		expect(r.state).toBe('success');
	});

	it('combined에 실제 항목(total_count>=1)이 failure면 failure 반영', () => {
		const r = aggregateCiStatus({
			checkRuns: [run('success')],
			combined: { state: 'failure', total_count: 2 },
		});
		expect(r.state).toBe('failure');
		expect(r.failedChecks).toContain('combined-status');
	});

	it('combined success(total_count>=1)도 passed에 합산', () => {
		const r = aggregateCiStatus({
			checkRuns: [],
			combined: { state: 'success', total_count: 3 },
		});
		expect(r.state).toBe('success');
		expect(r.total).toBe(3);
	});

	// gap-1: freshly-pushed면 checks 0개여도 none 아닌 pending 유예.
	it('gap-1: checks 0개 + freshlyPushed=true → pending (none 아님)', () => {
		const r = aggregateCiStatus({ checkRuns: [], combined: null, freshlyPushed: true });
		expect(r.state).toBe('pending');
	});

	it('gap-1: checks 0개 + freshlyPushed=false → none', () => {
		const r = aggregateCiStatus({ checkRuns: [], combined: null, freshlyPushed: false });
		expect(r.state).toBe('none');
	});

	it('알 수 없는 conclusion → 보수적으로 pending (success 오판 금지)', () => {
		const r = aggregateCiStatus({ checkRuns: [run('mystery_value')], combined: null });
		expect(r.state).toBe('pending');
	});

	// adversarial MINOR-1: combined state가 union(success/pending/failure) 외 unknown인데 항목이 있으면
	// 보수적으로 pending(가짜 green 차단). check_runs unknown conclusion 처리와 대칭.
	it('adversarial MINOR-1: combined unknown state(total_count>=1) → pending (success 오판 금지)', () => {
		const r = aggregateCiStatus({
			checkRuns: [run('success')],
			combined: { state: 'mystery_state', total_count: 2 },
		});
		expect(r.state).toBe('pending');
	});

	it('adversarial MINOR-1: combined unknown state라도 total_count 0이면 중립(빈 소스) → checks 기준 판정', () => {
		const r = aggregateCiStatus({
			checkRuns: [run('success')],
			combined: { state: 'mystery_state', total_count: 0 },
		});
		expect(r.state).toBe('success');
	});
});

describe('matchesCiGateFlag (APS-5-13 enrollment 매칭)', () => {
	it('코드가 CI_GATE_PROJECTS에 포함 → true', () => {
		expect(matchesCiGateFlag('APS', 'APS')).toBe(true);
		expect(matchesCiGateFlag('DIET', 'APS,DIET')).toBe(true);
	});

	it('미포함 → false', () => {
		expect(matchesCiGateFlag('SLS', 'APS,DIET')).toBe(false);
	});

	it('빈값/미설정/공백/comma-only → false (게이트 완전 비활성, 회귀 0)', () => {
		expect(matchesCiGateFlag('APS', '')).toBe(false);
		expect(matchesCiGateFlag('APS', undefined)).toBe(false);
		expect(matchesCiGateFlag('APS', '   ')).toBe(false);
		expect(matchesCiGateFlag('APS', ',')).toBe(false);
	});

	it('code가 null → false', () => {
		expect(matchesCiGateFlag(null, 'APS')).toBe(false);
	});

	it('case-exact (소문자 불일치 → false)', () => {
		expect(matchesCiGateFlag('aps', 'APS')).toBe(false);
	});
});

// === approveReview CI 게이트 (repos·GitHubService 모킹, DB 비의존) ===
// WorkflowService는 repo/service를 직접 new 하므로 vi.mock으로 모듈 단위 스텁.

const {
	mockGetById,
	mockUpdateStatus,
	mockActivityCreate,
	mockGetCiStatusForPrUrl,
	mockEpicFindById,
	mockProjectFindById,
	mockFindByEpic,
} = vi.hoisted(() => ({
	mockGetById: vi.fn(),
	mockUpdateStatus: vi.fn(),
	mockActivityCreate: vi.fn(),
	mockGetCiStatusForPrUrl: vi.fn(),
	mockEpicFindById: vi.fn(),
	mockProjectFindById: vi.fn(),
	mockFindByEpic: vi.fn(),
}));

vi.mock('../services/task-service.js', () => ({
	TaskService: class {
		getById = mockGetById;
		updateStatus = mockUpdateStatus;
	},
}));
vi.mock('../services/github-service.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../services/github-service.js')>();
	return {
		...actual,
		GitHubService: class {
			getCiStatusForPrUrl = mockGetCiStatusForPrUrl;
		},
	};
});
vi.mock('../db/repositories/activity-repo.js', () => ({
	ActivityRepository: class {
		create = mockActivityCreate;
	},
}));
vi.mock('../db/repositories/epic-repo.js', () => ({
	EpicRepository: class {
		findById = mockEpicFindById;
	},
}));
vi.mock('../db/repositories/project-repo.js', () => ({
	ProjectRepository: class {
		findById = mockProjectFindById;
	},
}));
vi.mock('../db/repositories/task-repo.js', () => ({
	TaskRepository: class {
		findByEpic = mockFindByEpic;
		getDependencies = vi.fn().mockResolvedValue([]);
	},
}));
vi.mock('../db/repositories/test-run-repo.js', () => ({
	TestRunRepository: class {},
}));
vi.mock('../db/repositories/fix-attempt-repo.js', () => ({
	FixAttemptRepository: class {},
}));
vi.mock('../services/context-service.js', () => ({
	ContextService: class {
		getSessionContext = vi.fn().mockResolvedValue({ nextRecommended: null });
	},
}));

const NOTES = 'code-reviewer 통과: CI 게이트 단위 테스트용 충분한 길이의 리뷰 노트입니다.';

async function makeService() {
	const { WorkflowService } = await import('../services/workflow-service.js');
	return new WorkflowService();
}

describe('approveReview CI 게이트 (APS-5-13)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEpicFindById.mockResolvedValue({ project_id: 'proj-1' });
		mockProjectFindById.mockResolvedValue({ code: 'APS' });
		mockFindByEpic.mockResolvedValue([]);
		mockUpdateStatus.mockResolvedValue({ task: { id: 't1', title: 'T', epic_id: null } });
		// APS-5-13(보안 MINOR-2): enrolled 경로는 API_KEY 필수 — 기본값 설정(개별 테스트가 override).
		process.env.API_KEY = 'test-api-key';
	});
	afterEach(() => {
		// APS-5-13(adversarial SUG): undefined 할당은 문자열 "undefined"가 될 수 있어 delete로 완전 제거.
		// biome-ignore lint/performance/noDelete: test cleanup requires real env deletion
		delete process.env.CI_GATE_PROJECTS;
		// biome-ignore lint/performance/noDelete: test cleanup requires real env deletion
		delete process.env.API_KEY;
	});

	it('회귀 0: CI_GATE_PROJECTS 미설정 → CI red여도 done 통과 (게이트 미진입, GitHubService 미호출)', async () => {
		process.env.CI_GATE_PROJECTS = '';
		mockGetById.mockResolvedValue({ id: 't1', title: 'T', epic_id: 'e1', github_pr: null });
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).resolves.toBeDefined();
		expect(mockGetCiStatusForPrUrl).not.toHaveBeenCalled();
		expect(mockUpdateStatus).toHaveBeenCalledWith(
			't1',
			'done',
			expect.any(String),
			expect.objectContaining({ bypassGuard: true }),
		);
	});

	it('enforce on + PR 미연결 → 차단(throw), done 미전환', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({ id: 't1', title: 'T', epic_id: 'e1', github_pr: null });
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).rejects.toThrow(/PR 필요|PR 연결|연결 PR/);
		expect(mockUpdateStatus).not.toHaveBeenCalled();
	});

	it('enforce on + CI green → done 통과', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		mockGetCiStatusForPrUrl.mockResolvedValue({
			state: 'success',
			total: 3,
			passed: 3,
			failedChecks: [],
		});
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).resolves.toBeDefined();
		expect(mockUpdateStatus).toHaveBeenCalled();
	});

	it('enforce on + CI failure → 차단 + audit 로그는 throw 이전 기록(gap-2)', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		mockGetCiStatusForPrUrl.mockResolvedValue({
			state: 'failure',
			total: 2,
			passed: 1,
			failedChecks: ['build'],
		});
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).rejects.toThrow(/CI 실패/);
		expect(mockUpdateStatus).not.toHaveBeenCalled();
		// gap-2: ci_gate_check 활동이 throw 이전에 기록되어야 함
		expect(mockActivityCreate).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'ci_gate_check' }),
		);
	});

	it('enforce on + CI error(토큰/네트워크) → fail-closed 차단', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		mockGetCiStatusForPrUrl.mockResolvedValue({
			state: 'error',
			total: 0,
			passed: 0,
			failedChecks: [],
		});
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).rejects.toThrow(/CI 조회 실패|fail-closed/);
		expect(mockUpdateStatus).not.toHaveBeenCalled();
	});

	it('enforce on + CI pending → 차단', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		mockGetCiStatusForPrUrl.mockResolvedValue({
			state: 'pending',
			total: 1,
			passed: 0,
			failedChecks: [],
		});
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).rejects.toThrow(/CI 미완료/);
		expect(mockUpdateStatus).not.toHaveBeenCalled();
	});

	it('비-enrolled 프로젝트(코드 미매칭) → CI red여도 통과', async () => {
		process.env.CI_GATE_PROJECTS = 'OTHER';
		mockGetById.mockResolvedValue({ id: 't1', title: 'T', epic_id: 'e1', github_pr: null });
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).resolves.toBeDefined();
		expect(mockGetCiStatusForPrUrl).not.toHaveBeenCalled();
	});

	// 보안 MINOR-2: enrolled인데 API_KEY 미설정 → 무인증 표면 차단(fail-closed), done 미전환.
	it('보안 MINOR-2: enrolled + API_KEY 미설정 → fail-closed 차단', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		// biome-ignore lint/performance/noDelete: test requires real env deletion (API_KEY 미설정 시뮬레이션)
		delete process.env.API_KEY;
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).rejects.toThrow(/API_KEY 필수|무인증/);
		expect(mockUpdateStatus).not.toHaveBeenCalled();
		// CI 조회 이전(API_KEY 게이트)에 차단되어야 하므로 GitHubService 미호출
		expect(mockGetCiStatusForPrUrl).not.toHaveBeenCalled();
	});

	it('보안 MINOR-2: enrolled + API_KEY 공백만 → fail-closed 차단', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		process.env.API_KEY = '   ';
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).rejects.toThrow(/API_KEY 필수|무인증/);
		expect(mockUpdateStatus).not.toHaveBeenCalled();
	});

	// code-reviewer m2: enrolled여도 epic_id:null이면 shouldEnforceCiGate가 false 폴백 → 안전 통과.
	// (epic→project 조회로 코드 매칭이 불가하므로 게이트 미진입 = 기존 동작 보존)
	it('code-reviewer m2: enrolled + epic_id:null → 게이트 미진입, CI red여도 안전 통과', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({ id: 't1', title: 'T', epic_id: null, github_pr: null });
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).resolves.toBeDefined();
		expect(mockGetCiStatusForPrUrl).not.toHaveBeenCalled();
		expect(mockUpdateStatus).toHaveBeenCalledWith(
			't1',
			'done',
			expect.any(String),
			expect.objectContaining({ bypassGuard: true }),
		);
	});

	// adversarial MINOR-3: success만 allow-list 통과. CiStatus.state로 비-union(예: 'mystery') 들어오면 차단.
	it('adversarial MINOR-3: 미인식 CI state → fail-closed 차단(success 외 fall-through 금지)', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		// 타입상 CiState union 외 값을 강제 주입해 fall-through 차단을 검증
		mockGetCiStatusForPrUrl.mockResolvedValue({
			state: 'mystery' as never,
			total: 1,
			passed: 1,
			failedChecks: [],
		});
		const svc = await makeService();
		await expect(svc.approveReview('t1', NOTES)).rejects.toThrow(/미인식|fail-closed/);
		expect(mockUpdateStatus).not.toHaveBeenCalled();
	});

	// 보안 MAJOR-1 회귀: done은 approveReview의 bypassGuard:true 경로로만 전환된다.
	// CI green 통과 시 updateStatus가 done + bypassGuard:true로 단 1회 호출됨을 못박는다.
	it('보안 MAJOR-1: done 전환은 approveReview의 bypassGuard:true 단일 경로(green 통과 시)', async () => {
		process.env.CI_GATE_PROJECTS = 'APS';
		mockGetById.mockResolvedValue({
			id: 't1',
			title: 'T',
			epic_id: 'e1',
			github_pr: 'https://github.com/bluesky78060/ai-pm-system/pull/5',
		});
		mockGetCiStatusForPrUrl.mockResolvedValue({
			state: 'success',
			total: 3,
			passed: 3,
			failedChecks: [],
		});
		const svc = await makeService();
		await svc.approveReview('t1', NOTES);
		const doneCalls = mockUpdateStatus.mock.calls.filter((c) => c[1] === 'done');
		expect(doneCalls).toHaveLength(1);
		expect(doneCalls[0][3]).toEqual(expect.objectContaining({ bypassGuard: true }));
	});
});
