/**
 * APS-1-25: 테스트 실행이 의도치 않은 데이터베이스에 붙는 것을 막는다.
 *
 * 2026-05-18 production Neon DB wipe 사고의 마지막 방어선이다.
 * APS-1-32가 `.env.test`를 셸 값보다 우선시키고 파일·키 부재 시 fail-fast 하게 했지만,
 * **`.env.test`가 존재하면서 프로덕션을 가리키는 경우**는 이 가드만이 막는다.
 *
 * 가드가 `getPool()`(db/connection.ts) 안에 있는 이유: 테스트 하네스가 아니라 **실제로 풀을
 * 여는 지점**에 두어야 `vitest --config <다른파일>` 같은 우회를 막을 수 있다.
 * "테스트를 어떻게 실행했는가"가 아니라 "실제로 어느 DB에 붙는가"를 봐야 한다.
 */

/** 이 저장소의 프로덕션 Neon compute. 브랜치 br-billowing-heart-aozi9xug. */
const PROD_COMPUTE_HOSTS = [
	'ep-old-haze-aol2r7dt.c-2.ap-southeast-1.aws.neon.tech',
	'ep-old-haze-aol2r7dt-pooler.c-2.ap-southeast-1.aws.neon.tech',
].map(normalizeHost);

/**
 * DNS 호스트명은 대소문자를 구분하지 않고 트레일링 점은 같은 이름을 가리킨다.
 * 비교 전에 반드시 통과시킨다.
 *
 * 이 정규화가 없으면 대문자로 쓴 프로덕션 호스트가 가드를 통과한다 — `postgresql:`은
 * WHATWG URL 스펙의 special scheme(http/https/ws/wss/ftp/file)이 아니라서
 * `new URL().hostname`이 소문자화를 해주지 않기 때문이다. `http://`와 동작이 다르다.
 *
 * 알려진 한계: IPv6는 `[2001:db8::1]` 형태로 대괄호가 남고, 트레일링 점 제거는
 * 비-global 정규식이라 `host..`는 `host.`까지만 줄어든다. Neon/Render는 둘 다
 * 쓰지 않으므로 방치하되, 모르고 남긴 것이 아님을 밝혀 둔다.
 */
export function normalizeHost(host: string): string {
	return host.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * 연결 문자열에서 호스트명을 꺼낸다. **절대 예외를 던지지 않는다.**
 *
 * `new URL()`은 비밀번호에 `#`·`?`·`/`가 있으면 throw한다. pg가 쓰는
 * `pg-connection-string`은 그것을 정규화해 회피하므로, 날것 `new URL()`을 쓰면
 * **pg가 정상 연결하는 URL에서 이 함수가 죽는다.** `getPool()`은 `runMigrations()`를 통해
 * 앱 부팅 시 호출되므로(api-server.ts) 그 예외는 프로덕션 부팅 전체를 막는다.
 *
 * 실패 시 `null`을 돌려주고 **호출자가 판단한다** — 두 소비자가 같은 실패를 반대로 처리한다:
 * - 로그: `'(unparsable)'`로 찍고 **계속 진행**. 로그가 연결을 막아서는 안 된다
 * - 가드: **차단**. 호스트를 확인할 수 없으면 통과시킬 수 없다 (fail-closed)
 *
 * 주의: 이 함수는 **URL authority의 호스트만** 본다. `pg-connection-string`은 `?host=`
 * 쿼리 파라미터로 host를 오버라이드할 수 있으므로, 가드는 이 함수만 써서는 안 된다 —
 * `candidateHosts()`를 쓸 것.
 */
export function safeHostname(connectionString: string): string | null {
	try {
		const h = new URL(connectionString).hostname;
		return h ? normalizeHost(h) : null;
	} catch {
		return null;
	}
}

/**
 * pg가 **실제로 붙을 수 있는** 호스트 후보를 전부 모은다.
 *
 * `pg-connection-string`(pg가 쓰는 파서)은 쿼리 파라미터를 그대로 config 키에 채우고
 * `if (!config.host)`일 때만 URL authority의 hostname을 쓴다. 즉 `?host=`가 있으면 그쪽이 이긴다.
 *
 * 두 가지를 놓치기 쉽다. 둘 다 실제로 우회에 쓰였다 (APS-1-25 codex 리뷰):
 *
 * 1. **`?host=` 존재 자체** — authority만 검사하면
 *    `postgresql://u:p@<허용호스트>/db?host=<프로덕션>`이 통과한다.
 * 2. **같은 키의 중복** — `searchParams.get('host')`는 **첫 값**을 주는데
 *    `pg-connection-string`은 entries를 순회하며 덮어쓰므로 **마지막 값**이 이긴다.
 *    `?host=<허용>&host=<프로덕션>`이면 가드는 허용을 보고 pg는 프로덕션에 붙는다.
 *    그래서 `getAll()`로 **모든 값**을 모은다.
 *
 * `hostaddr`도 함께 모은다. 현재 pg 버전에서 이 값은 연결 host를 오버라이드하지 **않지만**,
 * libpq 시맨틱에서는 접속 주소를 지정하는 값이고 파서 구현이 바뀔 수 있으므로 보수적으로 검사한다.
 * 그 결과 `hostaddr`에 허용되지 않은 값을 넣으면 오탐으로 차단될 수 있다 — 의도된 보수성이다.
 *
 * 후보가 하나도 없으면(파싱 실패, authority·쿼리 모두 비어 있음) `null`을 돌려 호출자가 차단하게 한다.
 * 유닉스 소켓 URL(`postgresql:///db?host=/var/run/postgresql`)도 이 경로로 차단된다 —
 * 이 저장소는 Neon/Render만 쓰므로 fail-closed를 택했다. 필요하면 소켓 경로를
 * `TEST_DB_ALLOWED_HOSTS`에 넣어 허용할 수 있다.
 */
export function candidateHosts(connectionString: string): string[] | null {
	let url: URL;
	try {
		url = new URL(connectionString);
	} catch {
		return null;
	}
	const hosts: string[] = [];
	const push = (raw: string | null | undefined) => {
		if (!raw) return;
		const n = normalizeHost(raw);
		if (n && !hosts.includes(n)) hosts.push(n);
	};
	push(url.hostname);
	// getAll: 같은 키가 여러 번 오면 pg는 마지막 값을 쓴다. 전부 검사한다.
	for (const key of ['host', 'hostaddr']) {
		for (const v of url.searchParams.getAll(key)) push(v);
	}
	return hosts.length > 0 ? hosts : null;
}

function fail(reason: string, hint: string): never {
	throw new Error(
		[
			`APS-1-25 SAFETY: ${reason}`,
			'테스트가 의도치 않은 데이터베이스에 붙는 것을 막았습니다.',
			hint,
			'자세한 내용: docs/ci-test-isolation.md',
		].join('\n'),
	);
}

/**
 * 테스트 실행 중이면 DATABASE_URL의 호스트를 검사한다. 프로덕션 경로에서는 아무것도 하지 않는다.
 *
 * 판정 순서 — 앞선 단계가 이긴다. **pg가 붙을 수 있는 모든 호스트에 대해** 적용한다:
 *   1. VITEST 미설정        → 통과 (프로덕션 경로. 가드 대상 아님)
 *   2. 호스트 파싱 실패      → 차단 (확인 불가능하면 통과시킬 수 없다)
 *   3. 프로덕션 호스트       → 차단 (allow-list보다 먼저. 실수로 allow-list에 넣어도 막는다)
 *   4. allow-list 미설정     → 차단 (**모르면 차단.** 이것이 이 가드의 본체)
 *   5. allow-list 미포함     → 차단
 *   6. 그 외                → 통과
 *
 * 4번이 핵심이다. 이전 구현은 "아는 것만 차단하고 모르면 통과"였다 — 방향이 반대였다.
 */
export function assertTestDatabase(connectionString: string): void {
	if (!process.env.VITEST) return;

	const hosts = candidateHosts(connectionString);
	if (hosts === null) {
		fail(
			'DATABASE_URL에서 호스트명을 해석할 수 없습니다.',
			'비밀번호에 #, ?, / 같은 문자가 있으면 URL 파싱이 실패합니다. 퍼센트 인코딩(%23, %3F, %2F)으로 바꾸거나 비밀번호를 재발급하십시오.',
		);
	}

	for (const host of hosts) {
		if (PROD_COMPUTE_HOSTS.includes(host)) {
			fail(
				`DATABASE_URL이 프로덕션 compute를 가리킵니다 (${host}).`,
				'저장소 루트 .env.test가 전용 테스트 브랜치를 가리키는지 확인하십시오. ?host= 쿼리 파라미터도 검사 대상입니다.',
			);
		}
	}

	const raw = process.env.TEST_DB_ALLOWED_HOSTS;
	if (!raw?.trim()) {
		fail(
			'TEST_DB_ALLOWED_HOSTS가 설정되지 않았습니다.',
			'.env.test에 테스트 DB 호스트명을 명시하십시오 ' +
				'(예: TEST_DB_ALLOWED_HOSTS=ep-xxxx-pooler.region.aws.neon.tech). ' +
				'CI라면 같은 이름의 secret이 필요합니다. ' +
				'모르는 호스트를 기본 차단하는 것이 의도된 동작입니다 — .env.test.example 참조.',
		);
	}
	const allowed = raw
		.split(',')
		.map(normalizeHost)
		.filter((h) => h.length > 0);

	for (const host of hosts) {
		if (!allowed.includes(host)) {
			fail(
				`DATABASE_URL의 호스트(${host})가 TEST_DB_ALLOWED_HOSTS에 없습니다.`,
				`허용 목록: ${allowed.join(', ') || '(비어 있음)'}. 테스트 DB를 바꿨다면 .env.test의 TEST_DB_ALLOWED_HOSTS도 함께 갱신하십시오. ?host= 쿼리 파라미터도 검사 대상입니다.`,
			);
		}
	}
}
