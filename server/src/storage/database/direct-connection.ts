import { Pool } from 'pg';
import { loadEnv } from './supabase-client.js';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  loadEnv();

  const dbUrl = process.env.PGDATABASE_URL;
  if (dbUrl) {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
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
export async function queryAll<T = any>(sql: string, params?: any[]): Promise<T[]> {
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
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
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

    // Feedback table
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id UUID,
        content TEXT NOT NULL,
        contact VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    
    // Add register_source column to user_profiles (if not exists)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'user_profiles' AND column_name = 'register_source'
        ) THEN
          ALTER TABLE user_profiles ADD COLUMN register_source VARCHAR(50) DEFAULT 'App';
        END IF;
      END $$;
    `);
    
    // Update register_source for existing WeChat Mini Program users
    await client.query(`
      UPDATE user_profiles 
      SET register_source = '微信小程序' 
      WHERE register_source IS NULL 
        AND id IN (
          SELECT a.id FROM auth.users a 
          WHERE a.email LIKE '%@wechat.local'
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

/**
 * Decode a potentially encoded display name
 * Supports URL-encoded (%xx) and base64 encoded strings
 */
function decodeDisplayName(raw: string): string {
  try {
    // Try URL decode first
    if (raw.includes('%')) {
      const decoded = decodeURIComponent(raw);
      if (decoded !== raw) return decoded;
    }
    // Try base64 decode (only if it looks like base64: alphanumeric + =)
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 6) {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      // Only use if it looks like valid text (contains Chinese or readable chars)
      if (/[\u4e00-\u9fff]/.test(decoded) || /^[a-zA-Z0-9@.]+$/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // If decoding fails, return original
  }
  return raw;
}

/**
 * Sync all auth.users to user_profiles - create entries for users without profiles
 */
export async function syncUsers(): Promise<void> {
  const client = await getPool().connect();
  try {
    // First, get users without profiles
    const users = await client.query(`
      SELECT a.id, SPLIT_PART(a.email, '@', 1) as raw_name, a.email
      FROM auth.users a
      LEFT JOIN user_profiles up ON a.id = up.id
      WHERE up.id IS NULL
    `);
    
    // Insert each user with decoded display name
    let syncedCount = 0;
    for (const user of users.rows) {
      const decodedName = decodeDisplayName(user.raw_name);
      let registerSource = 'App';
      if (user.raw_name.startsWith('wx_dev_')) registerSource = '微信小程序';
      else if (user.email && user.email.includes('@wechat.local')) registerSource = '微信小程序';
      else if (user.email && user.email.includes('@jizhangapp.local')) {
        // Check if it's a URL-encoded email (from App registration)
        try {
          const decoded = decodeURIComponent(user.raw_name);
          if (decoded !== user.raw_name) registerSource = 'App';
          else registerSource = 'Web';
        } catch { registerSource = 'Web'; }
      }
      await client.query(
        "INSERT INTO user_profiles (id, display_name, role, register_source, created_at) VALUES ($1, $2, 'parent', $3, NOW()) ON CONFLICT (id) DO NOTHING",
        [user.id, decodedName, registerSource]
      );
      syncedCount++;
    }
    
    // Also update existing profiles that might be missing register_source
    const updated = await client.query(`
      UPDATE user_profiles SET register_source = 'App' 
      WHERE register_source IS NULL OR register_source = ''
    `);
    
    console.log(`Synced ${syncedCount} users to user_profiles, updated ${updated.rowCount || 0} existing profiles`);
  } catch (error) {
    console.error('Error syncing users:', error);
  } finally {
    client.release();
  }
}

/**
 * Sync all data: users, activity logs from transactions, and metadata
 */
export async function syncAllData(): Promise<{ usersSynced: number; activityLogsCreated: number }> {
  const client = await getPool().connect();
  let usersSynced = 0;
  let activityLogsCreated = 0;
  try {
    // 1. Sync all users from auth.users to user_profiles
    const users = await client.query(`
      SELECT a.id, SPLIT_PART(a.email, '@', 1) as raw_name, a.email
      FROM auth.users a
      LEFT JOIN user_profiles up ON a.id = up.id
      WHERE up.id IS NULL
    `);
    
    for (const user of users.rows) {
      const decodedName = decodeDisplayName(user.raw_name);
      let registerSource = 'App';
      if (user.raw_name.startsWith('wx_dev_')) registerSource = '微信小程序';
      else if (user.email && user.email.includes('@wechat.local')) registerSource = '微信小程序';
      else if (user.email && user.email.includes('@jizhangapp.local')) {
        try {
          const decoded = decodeURIComponent(user.raw_name);
          if (decoded !== user.raw_name) registerSource = 'App';
          else registerSource = 'Web';
        } catch { registerSource = 'Web'; }
      }
      await client.query(
        "INSERT INTO user_profiles (id, display_name, role, register_source, created_at) VALUES ($1, $2, 'parent', $3, NOW()) ON CONFLICT (id) DO NOTHING",
        [user.id, decodedName, registerSource]
      );
      usersSynced++;
    }
    
    // 2. Backfill activity_logs from transactions (for users who already have transactions)
    const existingLogs = await client.query(`SELECT COUNT(*) as cnt FROM activity_logs`);
    if (parseInt(existingLogs.rows[0].cnt) === 0) {
      // Only backfill if activity_logs is empty
      const txResult = await client.query(`
        SELECT id, user_id, created_at, amount, type, category_id, date
        FROM transactions
        ORDER BY created_at ASC
      `);
      
      for (const tx of txResult.rows) {
        await client.query(
          `INSERT INTO activity_logs (user_id, activity_type, description, created_at) 
           VALUES ($1, 'create_transaction', $2, $3) ON CONFLICT DO NOTHING`,
          [tx.user_id, JSON.stringify({ amount: tx.amount, type: tx.type, category_id: tx.category_id, date: tx.date }), tx.created_at]
        );
        activityLogsCreated++;
      }
    }
    
    // 3. Fix any NULL register_source in existing profiles
    await client.query(`
      UPDATE user_profiles SET register_source = 'App' 
      WHERE register_source IS NULL OR register_source = ''
    `);
    
    console.log(`syncAllData: ${usersSynced} users synced, ${activityLogsCreated} activity logs created`);
  } catch (error) {
    console.error('Error syncing all data:', error);
  } finally {
    client.release();
  }
  return { usersSynced, activityLogsCreated };
}

/**
 * Get display name with decoding (for admin queries)
 */
export async function getDecodedDisplayName(userId: string): Promise<string> {
  try {
    const row = await queryOne('SELECT display_name FROM user_profiles WHERE id = $1', [userId]);
    if (row?.display_name) return decodeDisplayName(row.display_name);
    
    const authRow = await queryOne("SELECT SPLIT_PART(email, '@', 1) as raw_name FROM auth.users WHERE id = $1", [userId]);
    if (authRow?.raw_name) return decodeDisplayName(authRow.raw_name);
  } catch {
    // ignore
  }
  return '未设置';
}

export { getPool, decodeDisplayName };