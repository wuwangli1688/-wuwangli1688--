import { Pool } from 'pg';
import { loadEnv } from './supabase-client.js';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  loadEnv();

  const dbUrl = process.env.PGDATABASE_URL;
  if (dbUrl) {
    pool = new Pool({ connectionString: dbUrl });
  } else {
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false },
    });
  }

  return pool;
}

/**
 * Execute a SELECT query and return all rows
 */
export async function queryAll(sql: string, params?: any[]): Promise<any[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Execute a SELECT query and return the first row
 */
export async function queryOne(sql: string, params?: any[]): Promise<any> {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

/**
 * Execute a count query and return the count
 */
export async function queryCount(sql: string, params?: any[]): Promise<number> {
  const rows = await queryAll(sql, params);
  return parseInt(rows[0]?.count || '0');
}

/**
 * Execute an INSERT/UPDATE/DELETE query
 */
export async function execute(sql: string, params?: any[]): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(sql, params);
  } finally {
    client.release();
  }
}

export { getPool };