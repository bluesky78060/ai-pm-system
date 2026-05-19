import pg from 'pg';

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
    // Log connection type for debugging
    const dbType = connectionString.includes('neon.tech') ? 'Neon'
      : connectionString.includes('render.com') ? 'Render'
      : 'PostgreSQL';
    console.error(`[DB Connection] Connected to ${dbType} database`);

    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('render.com') || connectionString.includes('neon.tech')
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
