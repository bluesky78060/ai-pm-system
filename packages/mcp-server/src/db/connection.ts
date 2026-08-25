import pg from 'pg';
import { assertTestDatabase, safeHostname } from '../utils/test-db-guard.js';

// APS-5-10: Return TIMESTAMPTZ/TIMESTAMP as ISO strings instead of Date objects.
// Entity type declarations use `string` for timestamp fields; pg default returns Date objects → mismatch.
// Setting type parsers here (module-level, before any Pool is created) ensures all pools use string timestamps.
pg.types.setTypeParser(1184, (val: string) => val); // timestamptz (OID 1184)
pg.types.setTypeParser(1114, (val: string) => val); // timestamp  (OID 1114)

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
	if (!pool) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
		}
		// APS-1-25: 테스트 실행이 의도치 않은 DB에 붙는 것을 막는다. 프로덕션 경로(VITEST 미설정)에서는
		// 아무것도 하지 않는다. 가드를 테스트 하네스가 아니라 여기 둔 이유는 utils/test-db-guard.ts 참조.
		assertTestDatabase(connectionString);

		const dbType = connectionString.includes('neon.tech')
			? 'Neon'
			: connectionString.includes('render.com')
				? 'Render'
				: 'PostgreSQL';
		// APS-1-25: 이전 문구는 "Connected to ..."였는데 Pool 생성 **전에** 찍히므로 거짓이었고,
		// 어느 DB에 붙는지도 알려주지 않았다. 호스트를 찍었다면 APS-1-32의 결함(.env.test가
		// 무시되고 셸 값이 쓰이는 것)이 모든 테스트 실행에서 눈에 보였을 것이다.
		// safeHostname은 절대 던지지 않는다 — 로그 한 줄이 앱 부팅을 막아서는 안 된다.
		console.error(
			`[DB Connection] pool for ${dbType} @ ${safeHostname(connectionString) ?? '(unparsable)'}`,
		);

		pool = new Pool({
			connectionString,
			ssl:
				connectionString.includes('render.com') || connectionString.includes('neon.tech')
					? { rejectUnauthorized: true } // APS-5-7: Node.js 기본 CA 번들로 검증. Neon/Render CA는 Let's Encrypt/AWS이라 포함됨.
					: undefined,
			max: 10,
		});
	}
	return pool;
}

export async function closeDb(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
	}
}
