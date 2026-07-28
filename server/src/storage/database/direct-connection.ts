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

/**
 * Create required tables if they don't exist
 */
export async function createTables(): Promise<void> {
  const client = await getPool().connect();
  try {
    // Display name history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS display_name_history (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        old_name VARCHAR(255),
        new_name VARCHAR(255) NOT NULL,
        changed_by VARCHAR(100) DEFAULT 'admin',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    
    // User tags table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tags (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        tag VARCHAR(100) NOT NULL,
        created_by VARCHAR(100) DEFAULT 'admin',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, tag)
      )
    `);
    
    // Activity logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        activity_type VARCHAR(100) NOT NULL,
        description TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    
    // Add indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_display_name_history_user ON display_name_history(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_tags_user ON user_tags(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)');
    
    console.log('Tables created/verified successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    client.release();
  }
}

export { getPool };