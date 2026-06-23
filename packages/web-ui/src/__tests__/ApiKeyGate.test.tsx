import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNAUTHORIZED_EVENT } from '../api.ts';
import ApiKeyGate from '../components/ApiKeyGate.tsx';

// 게이트는 마운트 시 api.listProjects() 프로브 → fetch 모킹으로 상태머신 검증.
// RTL render는 StrictMode를 추가하지 않으므로 effect는 1회만 실행(루프 검증에 적합).

function okResp(body: unknown): Response {
	return {
		ok: true,
		status: 200,
		text: async () => JSON.stringify(body),
		json: async () => body,
	} as unknown as Response;
}
function errResp(status: number): Response {
	return {
		ok: false,
		status,
		text: async () => '{"error":"x"}',
		json: async () => ({ error: 'x' }),
	} as unknown as Response;
}

beforeEach(() => {
	localStorage.clear();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('ApiKeyGate 상태머신', () => {
	it('프로브 성공 → children 렌더 (enforce OFF/유효키)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => okResp({ projects: [] })),
		);
		render(
			<ApiKeyGate>
				<div>DASHBOARD</div>
			</ApiKeyGate>,
		);
		expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
	});

	it('프로브 401 → 키 입력 폼 (children 미렌더)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => errResp(401)),
		);
		render(
			<ApiKeyGate>
				<div>DASHBOARD</div>
			</ApiKeyGate>,
		);
		expect(await screen.findByText('API 키 입력')).toBeInTheDocument();
		expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
	});

	it('프로브 비-401(500) → 에러 + 재시도 (키 폼 아님)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => errResp(500)),
		);
		render(
			<ApiKeyGate>
				<div>DASHBOARD</div>
			</ApiKeyGate>,
		);
		expect(await screen.findByText('재시도')).toBeInTheDocument();
		expect(screen.queryByPlaceholderText('x-api-key')).not.toBeInTheDocument();
	});

	it('빈 바디 200 → children (authed, APS-3-3 MAJOR 회귀)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					({
						ok: true,
						status: 200,
						text: async () => '',
						json: async () => {
							throw new Error('no json');
						},
					}) as unknown as Response,
			),
		);
		render(
			<ApiKeyGate>
				<div>DASHBOARD</div>
			</ApiKeyGate>,
		);
		expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
	});

	it('프로브는 1회만 호출 (루프 없음)', async () => {
		const f = vi.fn(async () => errResp(401));
		vi.stubGlobal('fetch', f);
		render(
			<ApiKeyGate>
				<div>D</div>
			</ApiKeyGate>,
		);
		await screen.findByText('API 키 입력');
		await new Promise((r) => setTimeout(r, 50));
		expect(f).toHaveBeenCalledTimes(1);
	});

	it('잘못된 키 제출 → "키가 올바르지 않습니다"', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => errResp(401)),
		);
		render(
			<ApiKeyGate>
				<div>D</div>
			</ApiKeyGate>,
		);
		const input = await screen.findByPlaceholderText('x-api-key');
		fireEvent.change(input, { target: { value: 'wrong' } });
		fireEvent.click(screen.getByText('접속'));
		expect(await screen.findByText('키가 올바르지 않습니다.')).toBeInTheDocument();
	});

	it('세션 만료 이벤트(UNAUTHORIZED_EVENT) → authed에서 게이트 복귀', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => okResp({ projects: [] })),
		);
		render(
			<ApiKeyGate>
				<div>DASHBOARD</div>
			</ApiKeyGate>,
		);
		expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
		// 세션 만료/로그아웃 이벤트 → 게이트로 복귀 (authed → need-key)
		act(() => {
			window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
		});
		expect(await screen.findByText('API 키 입력')).toBeInTheDocument();
		expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
	});
});
