import pg from 'pg';

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
        ? { rejectUnauthorized: false }
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
