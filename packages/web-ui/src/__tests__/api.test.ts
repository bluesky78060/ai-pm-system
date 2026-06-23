import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNAUTHORIZED_EVENT, api, clearApiKey, getApiKey, setApiKey } from '../api.ts';

// request()는 모듈-private이라 공개 api 객체 + 키 헬퍼를 경유해 검증한다.
// fetch는 vi.stubGlobal로 모킹. localStorage(jsdom)는 beforeEach에서 초기화.

function okResp(body: unknown): Response {
	return {
		ok: true,
		status: 200,
		text: async () => JSON.stringify(body),
		json: async () => body,
	} as unknown as Response;
}
function errResp(status: number, body: unknown = { error: 'x' }): Response {
	return {
		ok: false,
		status,
		text: async () => JSON.stringify(body),
		json: async () => body,
	} as unknown as Response;
}

beforeEach(() => {
	localStorage.clear();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('키 헬퍼', () => {
	it('setApiKey/getApiKey는 trim, clearApiKey는 제거', () => {
		setApiKey('  abc  ');
		expect(getApiKey()).toBe('abc');
		clearApiKey();
		expect(getApiKey()).toBe('');
	});
});

describe('request() — x-api-key 주입', () => {
	it('키가 있으면 x-api-key 헤더 전송', async () => {
		setApiKey('mykey');
		const f = vi.fn(async () => okResp({ projects: [] }));
		vi.stubGlobal('fetch', f);
		await api.listProjects();
		const init = f.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers['x-api-key']).toBe('mykey');
	});

	it('키가 없으면 x-api-key 미전송', async () => {
		const f = vi.fn(async () => okResp({ projects: [] }));
		vi.stubGlobal('fetch', f);
		await api.listProjects();
		const init = f.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers['x-api-key']).toBeUndefined();
	});
});

describe('request() — status & 401 이벤트', () => {
	it('비-2xx throw에 HTTP status 부착', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => errResp(500)),
		);
		await expect(api.listProjects()).rejects.toMatchObject({ status: 500 });
	});

	it('keyed 401 → clearApiKey + 이벤트 1회 발화', async () => {
		setApiKey('bad');
		const listener = vi.fn();
		window.addEventListener(UNAUTHORIZED_EVENT, listener);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => errResp(401)),
		);
		await expect(api.listProjects()).rejects.toMatchObject({ status: 401 });
		expect(listener).toHaveBeenCalledOnce();
		expect(getApiKey()).toBe(''); // 무효 키 제거됨
		window.removeEventListener(UNAUTHORIZED_EVENT, listener);
	});

	it('keyless 401 → 이벤트 없음 + clear 없음 (프로브 루프 방지)', async () => {
		const listener = vi.fn();
		window.addEventListener(UNAUTHORIZED_EVENT, listener);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => errResp(401)),
		);
		await expect(api.listProjects()).rejects.toMatchObject({ status: 401 });
		expect(listener).not.toHaveBeenCalled();
		window.removeEventListener(UNAUTHORIZED_EVENT, listener);
	});
});

describe('request() — 빈/비-JSON 200 (APS-3-3 MAJOR 회귀)', () => {
	it('빈 바디 200 → {} 반환 (인증 사용자 갇힘 방지)', async () => {
		const f = vi.fn(
			async () =>
				({
					ok: true,
					status: 200,
					text: async () => '',
					json: async () => {
						throw new Error('Unexpected end of JSON input');
					},
				}) as unknown as Response,
		);
		vi.stubGlobal('fetch', f);
		await expect(api.listProjects()).resolves.toEqual({});
	});
});
