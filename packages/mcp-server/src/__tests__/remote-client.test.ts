import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	authWarnings,
	buildAuthHeaders,
	emitAuthWarningsOnce,
	isHttpInsecure,
	resetAuthWarningGuard,
} from '../remote-client.js';

// APS-1-12: buildAuthHeaders/authWarnings는 순수 함수(DB 비의존)라
// workflow-strict.test.ts 패턴대로 격리 단위 테스트 가능.

describe('buildAuthHeaders (APS-1-12 x-api-key 헤더)', () => {
	it('정상 키 → { x-api-key }', () => {
		expect(buildAuthHeaders('k')).toEqual({ 'x-api-key': 'k' });
	});

	it('undefined → {} (미설정 시 no-op)', () => {
		expect(buildAuthHeaders(undefined)).toEqual({});
	});

	it('빈 문자열 → {}', () => {
		expect(buildAuthHeaders('')).toEqual({});
	});

	it('공백만 → {} (trim 후 빈 키)', () => {
		expect(buildAuthHeaders('   ')).toEqual({});
	});

	it('앞뒤 공백 trim', () => {
		expect(buildAuthHeaders('  k  ')).toEqual({ 'x-api-key': 'k' });
	});
});

describe('authWarnings (APS-1-12 인증 경고 순수 헬퍼)', () => {
	it("빈 키('') → 빈키 경고 1건", () => {
		const w = authWarnings('https://x.com', '');
		expect(w).toHaveLength(1);
		expect(w[0]).toMatch(/empty after trim/);
	});

	it("공백 키(' ') → 빈키 경고 1건", () => {
		const w = authWarnings('https://x.com', ' ');
		expect(w).toHaveLength(1);
		expect(w[0]).toMatch(/empty after trim/);
	});

	it('http://example.com + 키 → http 경고', () => {
		const w = authWarnings('http://example.com', 'k');
		expect(w).toHaveLength(1);
		expect(w[0]).toMatch(/INSECURE channel/);
	});

	// ★MINOR1: 대문자 스킴 탐지 (toLowerCase 정규화)
	it('HTTP://EXAMPLE.COM + 키 → http 경고 (대문자)', () => {
		const w = authWarnings('HTTP://EXAMPLE.COM', 'k');
		expect(w).toHaveLength(1);
		expect(w[0]).toMatch(/INSECURE channel/);
	});

	// ★MINOR1: leading space 탐지 (trim 정규화)
	it('leading space + http + 키 → http 경고', () => {
		const w = authWarnings(' http://x.com', 'k');
		expect(w).toHaveLength(1);
		expect(w[0]).toMatch(/INSECURE channel/);
	});

	it('https://x.com + 키 → 무경고', () => {
		expect(authWarnings('https://x.com', 'k')).toEqual([]);
	});

	it('http://localhost:3000 + 키 → 무경고 (localhost 예외)', () => {
		expect(authWarnings('http://localhost:3000', 'k')).toEqual([]);
	});

	it('http://127.0.0.1 + 키 → 무경고 (loopback 예외)', () => {
		expect(authWarnings('http://127.0.0.1', 'k')).toEqual([]);
	});

	// ★MINOR1: URL 파싱 — host 위장(subdomain) 탐지
	it('http://localhost.evil.com + 키 → http 경고 (host=localhost.evil.com ≠ localhost)', () => {
		const w = authWarnings('http://localhost.evil.com', 'k');
		expect(w).toHaveLength(1);
		expect(w[0]).toMatch(/INSECURE channel/);
	});

	// ★MINOR1: URL 파싱 — userinfo 위장(@) 탐지 (실제 host=evil.com)
	it('http://localhost@evil.com + 키 → http 경고 (실제 host=evil.com)', () => {
		const w = authWarnings('http://localhost@evil.com', 'k');
		expect(w).toHaveLength(1);
		expect(w[0]).toMatch(/INSECURE channel/);
	});

	// ★MINOR1: IPv6 loopback 예외
	it('http://[::1] + 키 → 무경고 (IPv6 loopback 예외)', () => {
		expect(authWarnings('http://[::1]', 'k')).toEqual([]);
	});

	it('키 없음(undefined) → 무경고', () => {
		expect(authWarnings('http://example.com', undefined)).toEqual([]);
	});

	it('경고 문자열에 키값 미포함', () => {
		const w = authWarnings('http://example.com', 'super-secret-key');
		expect(w.join(' ')).not.toContain('super-secret-key');
	});
});

describe('isHttpInsecure (APS-1-12 ★MINOR1 URL 파싱 판정)', () => {
	it('http://example.com → true (비-루프백)', () => {
		expect(isHttpInsecure('http://example.com')).toBe(true);
	});

	it('http://localhost.evil.com → true (subdomain 위장)', () => {
		expect(isHttpInsecure('http://localhost.evil.com')).toBe(true);
	});

	it('http://localhost@evil.com → true (userinfo 위장, host=evil.com)', () => {
		expect(isHttpInsecure('http://localhost@evil.com')).toBe(true);
	});

	it('http://localhost:3000 → false (loopback)', () => {
		expect(isHttpInsecure('http://localhost:3000')).toBe(false);
	});

	it('http://127.0.0.1 → false (loopback)', () => {
		expect(isHttpInsecure('http://127.0.0.1')).toBe(false);
	});

	it('http://[::1] → false (IPv6 loopback)', () => {
		expect(isHttpInsecure('http://[::1]')).toBe(false);
	});

	it('https://x.com → false (https)', () => {
		expect(isHttpInsecure('https://x.com')).toBe(false);
	});

	it('파싱 불가 문자열 → false (다른 검증에 위임)', () => {
		expect(isHttpInsecure('not a url')).toBe(false);
		expect(isHttpInsecure(undefined)).toBe(false);
		expect(isHttpInsecure('')).toBe(false);
	});
});

describe('emitAuthWarningsOnce (APS-1-12 1회성 가드)', () => {
	beforeEach(() => {
		resetAuthWarningGuard();
		vi.stubEnv('API_URL', 'http://example.com');
		vi.stubEnv('API_KEY', 'k');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		resetAuthWarningGuard();
	});

	it('2회 호출해도 console.warn은 1회만 (once-guard)', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		emitAuthWarningsOnce();
		const afterFirst = warnSpy.mock.calls.length;
		emitAuthWarningsOnce();
		// 2번째 호출에서 console.warn이 추가로 발생하지 않음
		expect(warnSpy.mock.calls.length).toBe(afterFirst);
		// http 비-루프백 경고가 최소 1건 발생했음을 단언 (가드가 no-op이 아님 확인)
		expect(afterFirst).toBeGreaterThanOrEqual(1);
	});
});

// ★MINOR3: get/del 빈 헤더 wire no-op을 실제 fetch mock으로 단언.
// API_URL은 module-load 시점 const로 캡처되므로 vi.stubEnv만으로는 무효(dead).
// → vi.resetModules() + 동적 import로 API_URL을 실제 반영하고, fetch URL host까지 단언.
// API_KEY는 호출 시점 process.env를 읽으므로 import 후 stub으로도 충분하지만,
// 일관성을 위해 모든 stub을 동적 import 전에 설정한다.
describe('get/del wire 헤더 (APS-1-12 ★MINOR3 fetch mock)', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetModules();
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});
		vi.stubGlobal('fetch', fetchMock);
		// 1회성 경고 가드가 module-scope라 resetModules로 새 인스턴스가 생기지만
		// console.warn 노이즈 억제를 위해 spy 설치.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('API_KEY 미설정 시 get → 빈 헤더 + 올바른 URL host', async () => {
		vi.stubEnv('API_URL', 'https://api.example.com');
		vi.stubEnv('API_KEY', '');
		const { executeRemote } = await import('../remote-client.js');
		await executeRemote('list_projects', {});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(new URL(calledUrl).host).toBe('api.example.com');
		expect(calledUrl).toBe('https://api.example.com/api/projects');
		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers).toEqual({});
		expect(headers['x-api-key']).toBeUndefined();
	});

	it('API_KEY 설정 시 get → x-api-key 포함 + 올바른 URL host', async () => {
		vi.stubEnv('API_URL', 'https://api.example.com');
		vi.stubEnv('API_KEY', 'secret');
		const { executeRemote } = await import('../remote-client.js');
		await executeRemote('list_projects', {});
		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(new URL(calledUrl).host).toBe('api.example.com');
		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers['x-api-key']).toBe('secret');
	});

	it('API_KEY 미설정 시 del → 빈 헤더 + DELETE 메서드 + 올바른 URL host', async () => {
		vi.stubEnv('API_URL', 'https://api.example.com');
		vi.stubEnv('API_KEY', '');
		const { executeRemote } = await import('../remote-client.js');
		await executeRemote('manage_automation', { action: 'delete', rule_id: '1' });
		const callArgs = fetchMock.mock.calls[0][1];
		expect(callArgs.method).toBe('DELETE');
		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(new URL(calledUrl).host).toBe('api.example.com');
		const headers = callArgs.headers as Record<string, string>;
		expect(headers).toEqual({});
		expect(headers['x-api-key']).toBeUndefined();
	});

	it('API_KEY 설정 시 del → x-api-key 포함 + 올바른 URL host', async () => {
		vi.stubEnv('API_URL', 'https://api.example.com');
		vi.stubEnv('API_KEY', 'secret');
		const { executeRemote } = await import('../remote-client.js');
		await executeRemote('manage_automation', { action: 'delete', rule_id: '1' });
		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(new URL(calledUrl).host).toBe('api.example.com');
		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers['x-api-key']).toBe('secret');
	});
});
