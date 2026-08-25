import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	assertTestDatabase,
	candidateHosts,
	normalizeHost,
	safeHostname,
} from '../utils/test-db-guard.js';

const PROD = 'ep-old-haze-aol2r7dt.c-2.ap-southeast-1.aws.neon.tech';
const TEST_HOST = 'test-branch-pooler.region.aws.neon.invalid';
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
			/pg가 붙을 호스트를 확정할 수 없습니다/,
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

		// 재리뷰에서 뒤집힌 테스트다. 이전에는 hostaddr를 후보에 넣어 "검사한다"고
		// 주장했으나, 실측 결과 pg는 hostaddr를 연결 대상으로 쓰지 않고 authority를
		// 덮지도 않는다. 즉 우회 방지 효과는 0이면서, 후보 배열을 비지 않게 만들어
		// fail-closed 분기를 무력화하는 CRITICAL의 트리거였다 (아래 회귀 스위트 참조).
		// 따라서 authority가 유효하면 hostaddr는 판정에 영향을 주지 않는 것이 **옳다**.
		it('hostaddr는 authority가 유효하면 판정에 영향을 주지 않는다 (pg가 쓰지 않는 값)', () => {
			process.env.VITEST = 'true';
			process.env.TEST_DB_ALLOWED_HOSTS = TEST_HOST;
			expect(() => assertTestDatabase(`${url(TEST_HOST)}?hostaddr=${PROD}`)).not.toThrow();
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
			// 순서가 아니라 집합으로 본다 — 1순위는 pg가 실제로 쓸 값(마지막 host)이고,
			// 나머지는 보수적 합집합이다.
			expect(candidateHosts(`${url(TEST_HOST)}?host=a.neon.tech&host=b.neon.tech`)?.sort()).toEqual(
				[TEST_HOST, 'a.neon.tech', 'b.neon.tech'].sort(),
			);
		});

		it('candidateHosts가 authority와 쿼리 host를 모두 모은다', () => {
			expect(candidateHosts(`${url(TEST_HOST)}?host=other.neon.tech`)?.sort()).toEqual(
				[TEST_HOST, 'other.neon.tech'].sort(),
			);
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

/**
 * APS-1-25 재리뷰(3중 검증)에서 실행으로 증명된 우회들.
 *
 * 적대적 검증이 저장소의 `getPool()`을 그대로 통과시켜 엉뚱한 호스트로 dial하는 것을
 * 확인했다. 원인은 가드가 `pg-connection-string`을 **손으로 재구현**한 것이었고,
 * 근사와 실제가 갈리는 지점마다 미탐이 났다.
 *
 * 이 스위트는 그 페이로드들을 고정한다. 파서를 다시 근사하려는 변경이 있으면 여기서 죽는다.
 */
describe('APS-1-25 재리뷰: 파서 근사로 인한 우회 (회귀)', () => {
	const ALLOWED = 'allowed-test-host.invalid';
	beforeEach(() => {
		process.env.VITEST = '1';
		process.env.TEST_DB_ALLOWED_HOSTS = ALLOWED;
	});
	afterEach(() => {
		unsetEnv('PGHOST');
	});

	// authority가 비면 pg의 config.host는 '' → falsy → PGHOST(없으면 localhost)로 폴백한다.
	// 이전 구현은 hostaddr가 후보 배열을 비지 않게 만들어 fail-closed 분기를 무력화했다.
	it.each([
		['hostaddr 단독', `postgresql:///neondb?hostaddr=${ALLOWED}`],
		['host 말미 빈 값', `postgresql:///neondb?host=${ALLOWED}&host=`],
		['빈 host + hostaddr', `postgresql:///neondb?host=&hostaddr=${ALLOWED}`],
	])('%s: PGHOST로 폴백하는 URL을 차단한다', (_label, url) => {
		process.env.PGHOST = 'ep-someone-elses-db.neon.invalid';
		expect(() => assertTestDatabase(url)).toThrow(/APS-1-25 SAFETY/);
	});

	it('PGHOST가 프로덕션이면 그 사실을 정확히 지목한다', () => {
		process.env.PGHOST = PROD;
		expect(() => assertTestDatabase(`postgresql:///neondb?hostaddr=${ALLOWED}`)).toThrow(
			/프로덕션 compute를 가리킵니다/,
		);
	});

	// pg-connection-string은 socket: 에서 authority를 버리고 pathname을 소켓 경로로 쓴다.
	// 사유까지 단언한다. /APS-1-25 SAFETY/ 만 보면 화이트리스트를 지워도
	// allow-list 층이 대신 차단해 테스트가 **맞는 이유 없이** 통과한다(변이 생존).
	it('socket:// 스킴을 스킴 검사 단계에서 차단한다', () => {
		expect(() => assertTestDatabase(`socket://${ALLOWED}/tmp/somesock`)).toThrow(
			/pg가 붙을 호스트를 확정할 수 없습니다/,
		);
	});

	// 소켓 경로가 allow-list에 있으면 뒤 층이 통과시키므로, 스킴 검사만이 유일한 방어다.
	// 화이트리스트를 제거하면 이 테스트가 죽는다.
	it('소켓 경로가 allow-list에 있어도 socket:// 는 통과하지 못한다', () => {
		process.env.TEST_DB_ALLOWED_HOSTS = `${ALLOWED},/tmp/somesock`;
		expect(() => assertTestDatabase(`socket://${ALLOWED}/tmp/somesock`)).toThrow(
			/pg가 붙을 호스트를 확정할 수 없습니다/,
		);
	});

	// pg는 authority hostname에 decodeURIComponent를 한 번 더 건다.
	it('퍼센트 인코딩된 프로덕션 호스트를 deny-list가 잡는다', () => {
		const encoded = '%65p-old-haze-aol2r7dt.c-2.ap-southeast-1.aws.neon.tech';
		expect(() => assertTestDatabase(`postgresql://u:p@${encoded}/db`)).toThrow(
			/프로덕션 compute를 가리킵니다/,
		);
	});

	// 정규화 결과가 비는 host 지정을 조용히 버리면 미탐이 된다.
	it.each([
		['공백', '%20'],
		['점 하나', '.'],
	])('host=%s 처럼 빈 값으로 정규화되는 지정을 차단한다', (_l, v) => {
		expect(() => assertTestDatabase(`postgresql://${ALLOWED}/db?host=${v}`)).toThrow(
			/pg가 붙을 호스트를 확정할 수 없습니다/,
		);
	});

	// 값이 없는 ?host= 는 pg가 authority로 폴백하므로 effectiveHost()가 정답을 낸다.
	// 그래도 차단하는 것은 **추가 보수성**이지 미탐 방어가 아니다 — 아래 주석 참조.
	it('값 없는 ?host= 도 차단한다 (보수적 fail-closed)', () => {
		expect(() => assertTestDatabase(`postgresql://${ALLOWED}/db?host=`)).toThrow(
			/pg가 붙을 호스트를 확정할 수 없습니다/,
		);
	});

	it('정상적인 허용 호스트는 통과한다 (오탐 회귀)', () => {
		expect(() => assertTestDatabase(`postgresql://u:p@${ALLOWED}/neondb`)).not.toThrow();
	});

	// 가드가 pg와 **같은 파서 사본**을 쓰는지 고정한다. 다른 사본이 로드되면
	// 근사 문제가 그대로 재발하므로, 이 테스트가 그 회귀를 잡는다.
	it('가드와 pg가 동일한 pg-connection-string 사본을 로드한다', async () => {
		const { createRequire } = await import('node:module');
		const req = createRequire(import.meta.url);
		const fromGuard = req.resolve('pg-connection-string');
		const fromPg = createRequire(req.resolve('pg')).resolve('pg-connection-string');
		expect(fromGuard).toBe(fromPg);
	});
});
