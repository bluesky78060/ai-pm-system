import { describe, expect, it, vi } from 'vitest';
import { workflowFailure } from '../services/workflow-service.js';
// APS-1-18: 실제 프로덕션 함수를 import한다. 키워드 목록이나 상태 매핑을 이 파일에 복사하면
// 원본이 바뀌어도 테스트는 모른다 — 그것은 검증이 아니라 검증했다는 착각이다.
import { getErrorStatus } from '../utils/error-status.js';

// APS-1-18: addDependency 테스트용 repo 스텁.
// vi.mock은 호이스팅되므로 task-service.ts의 모듈 레벨 `new TaskRepository()`보다 먼저 적용된다.
// (초판은 테스트마다 vi.doMock + vi.resetModules + 동적 import를 썼는데, it.each 반복에서
//  경합이 나 mock이 적용되지 않는 실행이 생겼다. 그러면 실제 DB 경로를 타 resolveTask가
//  '태스크를 찾을 수 없습니다'를 던지고 404가 나온다 — flaky 테스트가 됐다.)
const depFixture: {
	tasks: Array<{ id: string; title: string; ticket_code: string }>;
	circular: boolean;
	findByCodeCalls: number;
} = { tasks: [], circular: true, findByCodeCalls: 0 };

vi.mock('../db/repositories/task-repo.js', () => ({
	TaskRepository: class {
		async findById(id: string) {
			return depFixture.tasks.find((t) => t.id === id);
		}
		async findByTicketCode(code: string) {
			depFixture.findByCodeCalls++;
			return depFixture.tasks.find((t) => t.ticket_code === code);
		}
		async hasCircularDependency() {
			return depFixture.circular;
		}
		async addDependency() {
			return undefined;
		}
	},
}));

vi.mock('../db/repositories/activity-repo.js', () => ({
	ActivityRepository: class {
		async create() {
			return undefined;
		}
	},
}));

import { TaskService } from '../services/task-service.js';

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// workflow-service.ts의 8개 호출 지점이 넘기는 action 인자 전수.
const ACTIONS = [
	'작업 시작',
	'testing 상태 전환',
	'review 상태 전환',
	'fixing 상태 전환',
	'blocked 상태 전환',
	'done 상태 전환',
	'in_progress 상태 전환',
];

// task-service.ts가 실제로 던지는 내부 예외 문구(소스에서 복사). 지어낸 예문을 쓰지 않는다.
const INNER_ERRORS: Array<{ label: string; message: string; expected: number }> = [
	{
		label: '잘못된 상태 전환 (task-service.ts:157)',
		message: '잘못된 상태 전환: todo → testing. 가능한 전환: in_progress, blocked',
		expected: 400,
	},
	{
		label: 'workflow-only 가드 (task-service.ts:172)',
		message:
			'testing → review 전환은 smart_workflow를 통해서만 가능합니다. testing→review: submit_test(빌드/테스트 결과 제출), review→done: approve_review(코드 리뷰 결과 제출)를 사용하세요.',
		expected: 400,
	},
	{
		label: '태스크 미발견 (task-service.ts:23)',
		message: '태스크를 찾을 수 없습니다',
		expected: 404,
	},
];

function captureMessage(fn: () => never): string {
	try {
		fn();
	} catch (e) {
		return (e as Error).message;
	}
	throw new Error('workflowFailure가 던지지 않았다 — never 계약 위반');
}

describe('APS-1-18: 에러 메시지에 내부 UUID가 새지 않는다', () => {
	const uuid = 'a1b2c3d4-1111-2222-3333-444455556666';

	// D5-1: 헬퍼가 만든 메시지에 UUID가 없다 (ticket_code null/non-null 양쪽)
	describe('workflowFailure', () => {
		it.each(ACTIONS)('ticket_code가 있으면 그것을 쓰고 UUID를 노출하지 않는다: %s', (action) => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const msg = captureMessage(() =>
				workflowFailure(action, { id: uuid, ticket_code: 'APS-1-3' }, new Error('boom')),
			);
			spy.mockRestore();
			expect(msg).not.toMatch(UUID_REGEX);
			expect(msg).toContain('APS-1-3');
		});

		it.each(ACTIONS)('ticket_code가 null이어도 UUID를 노출하지 않는다: %s', (action) => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const msg = captureMessage(() =>
				workflowFailure(action, { id: uuid, ticket_code: null }, new Error('boom')),
			);
			spy.mockRestore();
			expect(msg).not.toMatch(UUID_REGEX);
		});

		it('전체 식별자는 서버 로그에 남는다 (정보를 없애는 게 아니라 옮긴다)', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			captureMessage(() =>
				workflowFailure('작업 시작', { id: uuid, ticket_code: null }, new Error('boom')),
			);
			const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
			spy.mockRestore();
			expect(logged).toContain(uuid);
		});
	});

	// D5-2: 8 action × 내부 예외 3종의 HTTP 상태가 기대대로다
	// D5-3: ticket_code가 null일 때 자리표시자가 getErrorStatus 키워드를 포함하지 않는다
	//       — 이 두 개가 함께 APS-1-18 초안의 '식별자 없음'(→404) 결함을 잡는다
	describe('getErrorStatus 보존', () => {
		for (const action of ACTIONS) {
			for (const inner of INNER_ERRORS) {
				it(`${action} × ${inner.label} → ${inner.expected}`, () => {
					const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
					const nullCode = captureMessage(() =>
						workflowFailure(action, { id: uuid, ticket_code: null }, new Error(inner.message)),
					);
					const withCode = captureMessage(() =>
						workflowFailure(action, { id: uuid, ticket_code: 'APS-1-3' }, new Error(inner.message)),
					);
					spy.mockRestore();
					// 자리표시자가 상태 코드를 바꾸지 않아야 한다
					expect(getErrorStatus(nullCode)).toBe(inner.expected);
					expect(getErrorStatus(withCode)).toBe(inner.expected);
				});
			}
		}
	});
});

// D5-4: addDependency의 순환 의존성 메시지에 식별자가 없고, 전체 정보는 서버 로그에만 남는다
describe('APS-1-18: addDependency 순환 의존성 메시지', () => {
	const a = {
		id: 'aaaaaaaa-1111-2222-3333-444444444444',
		title: '첫 번째',
		ticket_code: 'APS-9-1',
	};
	const b = {
		id: 'bbbbbbbb-1111-2222-3333-444444444444',
		title: '두 번째',
		ticket_code: 'APS-9-2',
	};

	async function runCircular(titleA: string, titleB: string) {
		depFixture.tasks = [
			{ ...a, title: titleA },
			{ ...b, title: titleB },
		];
		depFixture.circular = true;
		depFixture.findByCodeCalls = 0;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		let message = '';
		try {
			await new TaskService().addDependency(a.ticket_code, b.ticket_code);
		} catch (e) {
			message = (e as Error).message;
		}
		const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
		spy.mockRestore();
		// 스텁이 실제로 쓰였는지 확인한다. mock이 적용되지 않으면 실제 DB 경로를 타
		// '태스크를 찾을 수 없습니다'(404)가 나오는데, 그것을 조용히 통과시키면 안 된다.
		expect(depFixture.findByCodeCalls).toBeGreaterThan(0);
		return { message, logged };
	}

	it('응답 메시지에 UUID도 title도 담지 않는다', async () => {
		const { message, logged } = await runCircular(a.title, b.title);
		expect(message).toBe('순환 의존성이 감지되었습니다');
		expect(message).not.toMatch(UUID_REGEX);
		expect(message).not.toContain(a.title);
		// 전체 식별자와 title은 서버 로그에만
		expect(logged).toContain(a.id);
		expect(logged).toContain(a.title);
	});

	// codex 리뷰 MAJOR: 사용자 자유 입력이 메시지에 들어가면 getErrorStatus가 그것을 보고
	// 상태 코드를 바꾼다 — HTTP 계약이 사용자 조종 가능해진다.
	// title에 키워드를 심어도 400에서 변하지 않아야 한다.
	it.each([
		'not found 처리',
		'invalid 입력 검증',
		'duplicate 제거',
		'must-have 기능',
		'찾을 수 없습니다',
	])('title이 "%s"여도 상태 코드가 400에서 변하지 않는다', async (evilTitle) => {
		const { message } = await runCircular(evilTitle, evilTitle);
		expect(message).not.toContain(evilTitle);
		expect(getErrorStatus(message)).toBe(400);
	});
});
