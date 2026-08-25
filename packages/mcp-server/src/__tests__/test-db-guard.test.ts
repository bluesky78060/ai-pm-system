import { afterEach, describe, expect, it } from 'vitest';
import {
	assertTestDatabase,
	candidateHosts,
	normalizeHost,
	safeHostname,
} from '../utils/test-db-guard.js';

const PROD = 'ep-old-haze-aol2r7dt.c-2.ap-southeast-1.aws.neon.tech';
const TEST_HOST = 'ep-red-queen-ao7svrsd-pooler.c-2.ap-southeast-1.aws.neon.tech';
const url = (host: string, pass = 'pass') => `postgresql://user:${pass}@${host}/neondb`;

// biome의 noDelete를 피하면서 env 키를 실제로 제거한다.
// `process.env.X = undefined`는 Node에서 문자열 "undefined"가 되므로 쓸 수 없다.
const unsetEnv = (key: string) => {
	Reflect.deleteProperty(process.env, key);
};

const originalAllowed = process.env.TEST_DB_ALLOWED_HOSTS;
const originalVitest = process.env.VITEST;

afterEach(() => {
	if (originalAllowed === undefined) unsetEnv('TEST_DB_ALLOWED_HOSTS');
	else process.env.TEST_DB_ALLOWED_HOSTS = originalAllowed;
	if (originalVitest === undefined) unsetEnv('VITEST');
	else process.env.VITEST = originalVitest;
});

// V5a: 로그가 연결을 막지 않는다 (MAJOR-1)
describe('safeHostname — 절대 던지지 않는다', () => {
	it.each([
		['정상', url('host.neon.tech')],
		['비밀번호에 #', url('host.neon.tech', 'pa#ss')],
		['비밀번호에 ?', url('host.neon.tech', 'pa?ss')],
		['비밀번호에 /', url('host.neon.tech', 'pa/ss')],
		['비밀번호에 공백', url('host.neon.tech', 'pa ss')],
		['빈 문자열', ''],
		['URL이 아님', 'not-a-url'],
	])('%s 입력에서 throw하지 않는다', (_label, cs) => {
		expect(() => safeHostname(cs)).not.toThrow();
	});

	it('파싱 실패 시 null을 돌려준다 (로그는 (unparsable)로 진행)', () => {
		expect(safeHostname(url('host.neon.tech', 'pa#ss'))).toBeNull();
		// 로그 소비자가 하는 일 — 크래시 없이 문자열이 만들어져야 한다
		const line = `[DB Connection] pool for Neon @ ${safeHostname(url('h.neon.tech', 'pa#ss')) ?? '(unparsable)'}`;
		expect(line).toContain('(unparsable)');
	});
});

// V5b: 호스트 정규화 (MAJOR-2)
describe('normalizeHost', () => {
	it.each([
		['대문자', 'EP-OLD-HAZE.NEON.TECH', 'ep-old-haze.neon.tech'],
		['트레일링 점', 'host.neon.tech.', 'host.neon.tech'],
		['앞뒤 공백', '  host.neon.tech  ', 'host.neon.tech'],
		['이미 정규형', 'host.neon.tech', 'host.neon.tech'],
	])('%s → 정규화', (_l, input, expected) => {
		expect(normalizeHost(input)).toBe(expected);
	});

	it('포트는 hostname에 애초에 포함되지 않는다', () => {
		expect(safeHostname('postgresql://u:p@host.neon.tech:5432/db')).toBe('host.neon.tech');
	});
});

describe('assertTestDatabase', () => {
	// 1. VITEST 미설정 → 통과 (프로덕션 경로 무영향)
	it('VITEST가 없으면 아무것도 하지 않는다 — 프로덕션 경로 무영향', () => {
		unsetEnv('VITEST');
		unsetEnv('TEST_DB_ALLOWED_HOSTS');
		// allow-list가 없고 프로덕션 호스트여도 통과해야 한다
		expect(() => assertTestDatabase(url(PROD))).not.toThrow();
	});

	// 0'. 호스트 파싱 실패 → 차단
	it('호스트를 해석할 수 없으면 차단한다 (fail-closed)', () => {
		process.env.VITEST = 'true';
		process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
		expect(() => assertTestDatabase(url(TEST_HOST, 'pa#ss'))).toThrow(
			/호스트명을 해석할 수 없습니다/,
		);
	});

	// 2. 프로덕션 호스트 → 차단 (allow-list보다 먼저)
	it.each([
		['direct', PROD],
		['pooler', 'ep-old-haze-aol2r7dt-pooler.c-2.ap-southeast-1.aws.neon.tech'],
		['대문자', PROD.toUpperCase()],
		['트레일링 점', `${PROD}.`],
	])('프로덕션 compute(%s)를 차단한다', (_l, host) => {
		process.env.VITEST = 'true';
		process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
		expect(() => assertTestDatabase(url(host))).toThrow(/프로덕션 compute/);
	});

	it('allow-list에 프로덕션을 넣어도 차단한다 (deny가 먼저)', () => {
		process.env.VITEST = 'true';
		process.env.TEST_DB_ALLOWED_HOSTS = `${TEST_HOST},${PROD}`;
		expect(() => assertTestDatabase(url(PROD))).toThrow(/프로덕션 compute/);
	});

	// 3. allow-list 미설정 → 차단 (이 가드의 본체)
	it.each([
		['미설정', undefined],
		['빈 문자열', ''],
		['공백만', '   '],
	])('TEST_DB_ALLOWED_HOSTS가 %s면 차단한다 — 모르면 차단', (_l, value) => {
		process.env.VITEST = 'true';
		if (value === undefined) unsetEnv('TEST_DB_ALLOWED_HOSTS');
		else process.env.TEST_DB_ALLOWED_HOSTS = value;
		expect(() => assertTestDatabase(url('some-unknown-host.neon.tech'))).toThrow(
			/TEST_DB_ALLOWED_HOSTS가 설정되지 않았습니다/,
		);
	});

	// 4. allow-list 미포함 → 차단
	it.each([
		['재생성된 Neon 엔드포인트', 'ep-brand-new-xyz123.c-2.ap-southeast-1.aws.neon.tech'],
		['Render 프로덕션', 'dpg-example-a.oregon-postgres.render.com'],
		['다른 프로젝트 DB', 'ep-other-project-9999-pooler.us-east-2.aws.neon.tech'],
	])('%s는 allow-list에 없으므로 차단한다', (_l, host) => {
		process.env.VITEST = 'true';
		process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
		expect(() => assertTestDatabase(url(host))).toThrow(/TEST_DB_ALLOWED_HOSTS에 없습니다/);
	});

	// 5. 정상 경로 → 통과
	it.each([
		['정확 일치', TEST_HOST],
		['대문자로 적어도', TEST_HOST.toUpperCase()],
		['트레일링 점이 있어도', `${TEST_HOST}.`],
	])('허용된 호스트(%s)는 통과한다 — 가드가 개발을 막지 않는다', (_l, host) => {
		process.env.VITEST = 'true';
		process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
		expect(() => assertTestDatabase(url(host))).not.toThrow();
	});

	it('allow-list에 공백·빈 항목이 섞여도 정상 동작한다', () => {
		process.env.VITEST = 'true';
		process.env.TEST_DB_ALLOWED_HOSTS = ` ${TEST_HOST} , , other.neon.tech `;
		expect(() => assertTestDatabase(url(TEST_HOST))).not.toThrow();
	});

	// codex 리뷰 CRITICAL: pg-connection-string은 ?host= 쿼리로 host를 오버라이드한다.
	// authority만 검사하면 가드는 테스트 호스트를 보고 통과시키는데 pg는 프로덕션에 붙는다.
	describe('?host= 쿼리 오버라이드 (codex CRITICAL)', () => {
		it('authority가 허용돼도 ?host=가 프로덕션이면 차단한다', () => {
			process.env.VITEST = 'true';
			process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
			expect(() => assertTestDatabase(`${url(TEST_HOST)}?host=${PROD}`)).toThrow(
				/프로덕션 compute/,
			);
		});

		it('authority가 허용돼도 ?host=가 allow-list 밖이면 차단한다', () => {
			process.env.VITEST = 'true';
			process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
			expect(() => assertTestDatabase(`${url(TEST_HOST)}?host=ep-unknown.neon.tech`)).toThrow(
				/TEST_DB_ALLOWED_HOSTS에 없습니다/,
			);
		});

		it('hostaddr 파라미터도 검사한다', () => {
			process.env.VITEST = 'true';
			process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
			expect(() => assertTestDatabase(`${url(TEST_HOST)}?hostaddr=${PROD}`)).toThrow(
				/프로덕션 compute/,
			);
		});

		it('?host=가 허용 목록에 있으면 통과한다', () => {
			process.env.VITEST = 'true';
			process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
			expect(() => assertTestDatabase(`${url(TEST_HOST)}?host=${TEST_HOST}`)).not.toThrow();
		});

		// codex challenge CRITICAL: searchParams.get()은 첫 값만 준다.
		// pg-connection-string은 entries를 순회해 마지막 값이 이긴다.
		it.each([
			['허용 → 프로덕션', `?host=${TEST_HOST}&host=${PROD}`],
			['허용 → 프로덕션 → 프로덕션', `?host=${TEST_HOST}&host=${PROD}&host=${PROD}`],
			['허용 → 프로덕션 → 허용', `?host=${TEST_HOST}&host=${PROD}&host=${TEST_HOST}`],
		])('중복 host 키(%s)에서 프로덕션이 섞이면 차단한다', (_l, query) => {
			process.env.VITEST = 'true';
			process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
			expect(() => assertTestDatabase(`${url(TEST_HOST)}${query}`)).toThrow(/프로덕션 compute/);
		});

		it('중복 host 키를 candidateHosts가 전부 모은다', () => {
			expect(candidateHosts(`${url(TEST_HOST)}?host=a.neon.tech&host=b.neon.tech`)).toEqual([
				TEST_HOST,
				'a.neon.tech',
				'b.neon.tech',
			]);
		});

		it('candidateHosts가 authority와 쿼리 host를 모두 모은다', () => {
			expect(candidateHosts(`${url(TEST_HOST)}?host=other.neon.tech`)).toEqual([
				TEST_HOST,
				'other.neon.tech',
			]);
		});
	});

	it('에러 메시지에 해결법이 담긴다 (가드가 지워지지 않게)', () => {
		process.env.VITEST = 'true';
		unsetEnv('TEST_DB_ALLOWED_HOSTS');
		try {
			assertTestDatabase(url('unknown.neon.tech'));
			throw new Error('차단되지 않았다');
		} catch (e) {
			const m = (e as Error).message;
			expect(m).toContain('.env.test');
			expect(m).toContain('docs/ci-test-isolation.md');
		}
	});
});
