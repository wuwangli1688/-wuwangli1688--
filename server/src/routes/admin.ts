import express, { type Request, type Response, Router } from 'express';
import { adminAuthMiddleware, createAdminToken } from '../middleware/admin-auth.js';
import {
  getPool,
  queryAll,
  queryOne,
  queryCount,
  execute,
  decodeDisplayName,
  syncAllData,
} from '../storage/database/direct-connection.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const adminLoginRouter = express.Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin888';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function formatMoney(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '-';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';
  return `¥${num.toFixed(2)}`;
}

function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Generate admin token
function generateAdminToken(): string {
  return createAdminToken();
}

// Login endpoint
adminLoginRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }

  const token = generateAdminToken();
  res.json({ token });
});

// Login page HTML
const loginHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>后台管理</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .login-title {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      text-align: center;
      margin-bottom: 8px;
    }
    .login-subtitle {
      text-align: center;
      color: #6b7280;
      margin-bottom: 32px;
      font-size: 14px;
    }
    .form-group { margin-bottom: 20px; }
    .form-label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }
    .form-input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      font-size: 15px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .form-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
    }
    .login-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.2s;
    }
    .login-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.35);
    }
    .login-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
      transform: none;
    }
    .error-msg {
      color: #dc2626;
      font-size: 14px;
      margin-top: 12px;
      text-align: center;
      display: none;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-title">后台管理</div>
    <div class="login-subtitle">Ledger Admin Dashboard</div>
    <form id="loginForm">
      <div class="form-group">
        <label class="form-label">用户名</label>
        <input type="text" class="form-input" id="username" placeholder="请输入用户名" required>
      </div>
      <div class="form-group">
        <label class="form-label">密码</label>
        <input type="password" class="form-input" id="password" placeholder="请输入密码" required>
      </div>
      <button type="submit" class="login-btn" id="submitBtn">登录</button>
      <div class="error-msg" id="errorMsg"></div>
    </form>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const submitBtn = document.getElementById('submitBtn');
    const errorMsg = document.getElementById('errorMsg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = '登录中...';
      errorMsg.style.display = 'none';

      try {
        const res = await fetch('/api/v1/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value
          })
        });
        const data = await res.json();

        if (res.ok && data.token) {
          localStorage.setItem('adminToken', data.token);
          window.location.href = '/api/v1/admin/dashboard';
        } else {
          throw new Error(data.error || '登录失败');
        }
      } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '登录';
      }
    });
  </script>
</body>
</html>`;

adminLoginRouter.get('/login', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(loginHtml);
});

adminLoginRouter.get('/dashboard', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(dashboardHtml);
});

// ===================== Admin API Router =====================

// Dashboard statistics
router.get('/dashboard-data', async (req: Request, res: Response) => {
  try {
    const [
      userStats,
      storeStats,
      transactionStats,
      subscriptionStats,
      feedbackStats,
      orderStats,
      versionStats,
      logStats,
      activeToday,
      revenueStats,
    ] = await Promise.all([
      queryOne<{ total: string; owners: string; members: string; active: string; zombie: string }>(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE p.role = 'parent' OR p.role = 'owner') as owners,
          COUNT(*) FILTER (WHERE p.role = 'child' OR p.role = 'member') as members,
          COUNT(*) FILTER (WHERE (p.role = 'parent' OR p.role = 'owner') AND GREATEST(u.last_sign_in_at, p.created_at) >= NOW() - INTERVAL '30 days') as active,
          COUNT(*) FILTER (WHERE (p.role = 'parent' OR p.role = 'owner') AND GREATEST(u.last_sign_in_at, p.created_at) < NOW() - INTERVAL '30 days') as zombie
        FROM user_profiles p
        LEFT JOIN auth.users u ON u.id = p.id
      `),
      queryOne<{ total: string }>(`SELECT COUNT(*) as total FROM stores`),
      queryOne<{ total: string; income: string; expense: string }>(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0) as income,
          COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) as expense
        FROM transactions
      `),
      queryOne<{ total: string; pro: string; free: string }>(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active' AND plan_type = 'pro') as pro,
          COUNT(*) FILTER (WHERE status = 'active' AND plan_type = 'free') as free
        FROM subscriptions
      `),
      queryOne<{ total: string }>(`
        SELECT COUNT(*) as total FROM feedback
      `),
      queryOne<{ total: string; paid: string; amount: string }>(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'paid') as paid,
          COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as amount
        FROM subscription_orders
      `),
      queryOne<{ total: string; latest: string }>(`
        SELECT COUNT(*) as total, MAX(created_at) as latest FROM app_versions
      `),
      queryOne<{ total: string }>(`SELECT COUNT(*) as total FROM activity_logs`),
      queryOne<{ count: string }>(`
        SELECT COUNT(DISTINCT user_id) as count 
        FROM activity_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      queryOne<{ today: string; month: string }>(`
        SELECT 
          COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND created_at >= CURRENT_DATE), 0) as today,
          COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as month
        FROM subscription_orders
      `),
    ]);

    res.json({
      totalUsers: parseInt(userStats?.total || '0', 10),
      ownerCount: parseInt(userStats?.owners || '0', 10),
      memberCount: parseInt(userStats?.members || '0', 10),
      activeUserCount: parseInt(userStats?.active || '0', 10),
      zombieUserCount: parseInt(userStats?.zombie || '0', 10),
      storeCount: parseInt(storeStats?.total || '0', 10),
      transactionCount: parseInt(transactionStats?.total || '0', 10),
      totalIncome: parseFloat(transactionStats?.income || '0'),
      totalExpense: parseFloat(transactionStats?.expense || '0'),
      subscriptionCount: parseInt(subscriptionStats?.total || '0', 10),
      proCount: parseInt(subscriptionStats?.pro || '0', 10),
      freeCount: parseInt(subscriptionStats?.free || '0', 10),
      feedbackCount: parseInt(feedbackStats?.total || '0', 10),
      orderCount: parseInt(orderStats?.total || '0', 10),
      paidOrderCount: parseInt(orderStats?.paid || '0', 10),
      orderRevenue: parseFloat(orderStats?.amount || '0'),
      appVersionCount: parseInt(versionStats?.total || '0', 10),
      latestVersion: versionStats?.latest || null,
      activityLogCount: parseInt(logStats?.total || '0', 10),
      activeUsersToday: parseInt(activeToday?.count || '0', 10),
      revenueToday: parseFloat(revenueStats?.today || '0'),
      revenueThisMonth: parseFloat(revenueStats?.month || '0'),
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ error: '获取仪表盘数据失败', detail: String(error) });
  }
});

// Users list with pagination, search, filters
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const role = (req.query.role as string) || '';
    const source = (req.query.source as string) || '';
    const status = (req.query.status as string) || '';
    const hasUpgrade = (req.query.hasUpgrade as string) || '';

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex} OR p.display_name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (role) {
      conditions.push(`p.role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }
    if (source) {
      conditions.push(`p.register_source = $${paramIndex}`);
      params.push(source);
      paramIndex++;
    }
    if (status) {
      if (status === 'active') {
        conditions.push(`GREATEST(u.last_sign_in_at, p.created_at) >= NOW() - INTERVAL '30 days'`);
      } else if (status === 'zombie') {
        conditions.push(`GREATEST(u.last_sign_in_at, p.created_at) < NOW() - INTERVAL '30 days'`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = params.slice();

    const countResult = await queryOne<{ total: string }>(`
      SELECT COUNT(*) as total
      FROM user_profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      ${whereClause}
    `, countParams);

    const queryParams = [...params, limit, offset];
    const users = await queryAll<{
      id: string;
      login_name: string;
      display_name: string;
      role: string;
      register_source: string;
      created_at: string;
      last_sign_in_at: string;
      subscription_status: string;
      plan_type: string;
      store_count: string;
      sub_account_count: string;
      transaction_count: string;
      has_upgrade: string;
      is_trial: string;
    }>(`
      SELECT 
        p.id,
        COALESCE(u.email, u.phone, '-') as login_name,
        p.display_name,
        p.role,
        p.register_source,
        p.created_at,
        u.last_sign_in_at,
        s.status as subscription_status,
        s.plan_type,
        (SELECT COUNT(*) FROM stores WHERE owner_id = p.id) as store_count,
        (SELECT COUNT(*) FROM user_profiles WHERE parent_user_id = p.id) as sub_account_count,
        (SELECT COUNT(*) FROM transactions WHERE user_id = p.id) as transaction_count,
        CASE WHEN s.id IS NOT NULL AND s.status = 'active' AND s.plan_type = 'pro' THEN 1 ELSE 0 END as has_upgrade,
        CASE WHEN s.id IS NOT NULL AND s.status = 'active' AND s.plan_type = 'pro' AND EXISTS (
          SELECT 1 FROM subscription_orders so 
          WHERE so.user_id = p.id 
            AND so.status = 'paid' 
            AND so.amount = 0 
            AND so.activated_at >= s.started_at
        ) THEN 1 ELSE 0 END as is_trial
      FROM user_profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      LEFT JOIN LATERAL (
        SELECT id, status, plan_type, started_at 
        FROM subscriptions 
        WHERE user_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) s ON true
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, queryParams);

    let formattedUsers = users.map(u => ({
      id: u.id,
      login_name: u.login_name,
      display_name: decodeDisplayName(u.display_name),
      role: u.role,
      role_title: u.role === 'parent' || (u.role === 'parent' || u.role === 'owner') ? '主账号' : '子账号',
      register_source: u.register_source || '-',
      created_at: u.created_at,
      last_active_at: u.last_sign_in_at || u.created_at,
      status: (!u.last_sign_in_at || new Date(u.last_sign_in_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) ? 'zombie' : 'active',
      subscription_status: u.subscription_status || 'none',
      plan_type: u.plan_type || '-',
      store_count: parseInt(u.store_count || '0', 10),
      sub_account_count: parseInt(u.sub_account_count || '0', 10),
      transaction_count: parseInt(u.transaction_count || '0', 10),
      has_upgrade: parseInt(u.has_upgrade || '0', 10) === 1,
      is_trial: parseInt(u.is_trial || '0', 10) === 1,
    }));

    if (hasUpgrade) {
      formattedUsers = formattedUsers.filter(u => {
        if (hasUpgrade === 'yes') return u.has_upgrade || u.is_trial;
        if (hasUpgrade === 'no') return !u.has_upgrade && !u.is_trial;
        return true;
      });
    }

    res.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total: parseInt(countResult?.total || '0', 10),
        totalPages: Math.ceil(parseInt(countResult?.total || '0', 10) / limit),
      },
    });
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).json({ error: '获取用户列表失败', detail: String(error) });
  }
});

// Users hierarchy: main accounts with their sub-accounts
router.get('/users/hierarchy', async (_req: Request, res: Response) => {
  try {
    const parents = await queryAll<{
      id: string;
      nickname: string;
      login_name: string;
      role: string;
      store_count: string;
      sub_account_count: string;
      last_sign_in_at: string | null;
      created_at: string;
    }>(`
      SELECT 
        p.id,
        COALESCE(p.display_name, '未设置') as nickname,
        COALESCE(u.email, u.phone, '-') as login_name,
        p.role,
        COALESCE(s.store_count, 0) as store_count,
        COALESCE(m.member_count, 0) as sub_account_count,
        u.last_sign_in_at,
        p.created_at
      FROM user_profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      LEFT JOIN (
        SELECT owner_id, COUNT(*) as store_count 
        FROM stores 
        GROUP BY owner_id
      ) s ON s.owner_id = p.id
      LEFT JOIN (
        SELECT parent_user_id, COUNT(*) as member_count 
        FROM user_profiles 
        WHERE parent_user_id IS NOT NULL 
        GROUP BY parent_user_id
      ) m ON m.parent_user_id = p.id
      WHERE p.role = 'parent'
      ORDER BY p.created_at DESC
    `);

    const parentIds = parents.map(p => p.id);
    const childrenMap = new Map<string, any[]>();

    if (parentIds.length > 0) {
      const children = await queryAll<{
        id: string;
        parent_user_id: string;
        nickname: string;
        login_name: string;
        role: string;
        store_count: string;
        last_sign_in_at: string | null;
        created_at: string;
      }>(`
        SELECT 
          p.id,
          p.parent_user_id,
          COALESCE(p.display_name, '未设置') as nickname,
          COALESCE(u.email, u.phone, '-') as login_name,
          p.role,
          COALESCE(s.store_count, 0) as store_count,
          u.last_sign_in_at,
          p.created_at
        FROM user_profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        LEFT JOIN (
          SELECT owner_id, COUNT(*) as store_count 
          FROM stores 
          GROUP BY owner_id
        ) s ON s.owner_id = p.id
        WHERE p.parent_user_id = ANY($1)
        ORDER BY p.created_at DESC
      `, [parentIds]);

      for (const child of children) {
        if (!childrenMap.has(child.parent_user_id)) childrenMap.set(child.parent_user_id, []);
        childrenMap.get(child.parent_user_id)!.push(child);
      }
    }

    const allUserIds = parentIds.concat(Array.from(childrenMap.values()).flat().map((c: any) => c.id));
    const subscriptionMap = new Map<string, { has_upgrade: boolean; is_trial: boolean }>();
    const txCountMap = new Map<string, number>();

    if (allUserIds.length > 0) {
      const subscriptions = await queryAll<{
        user_id: string;
        plan_type: string;
        status: string;
        expires_at: string | null;
      }>(`
        SELECT user_id, plan_type, status, expires_at
        FROM subscriptions
        WHERE user_id = ANY($1)
      `, [allUserIds]);

      const trialOrders = await queryAll<{ user_id: string }>(`
        SELECT DISTINCT user_id FROM subscription_orders 
        WHERE user_id = ANY($1) AND order_id LIKE 'admin-trial-%' AND status = 'paid'
      `, [allUserIds]);
      const trialUserIds = new Set(trialOrders.map(t => t.user_id));

      for (const sub of subscriptions) {
        const isActive = sub.status === 'active' && (!sub.expires_at || new Date(sub.expires_at) > new Date());
        const isPro = sub.plan_type === 'pro';
        subscriptionMap.set(sub.user_id, {
          has_upgrade: isPro && isActive,
          is_trial: isPro && isActive && trialUserIds.has(sub.user_id),
        });
      }

      const txCounts = await queryAll<{ user_id: string; cnt: string }>(`
        SELECT user_id, COUNT(*) as cnt FROM transactions WHERE user_id = ANY($1) GROUP BY user_id
      `, [allUserIds]);
      for (const t of txCounts) txCountMap.set(t.user_id, parseInt(t.cnt));
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    function computeStatus(lastSignIn: string | null, txCount: number): string {
      const lastActivity = lastSignIn ? new Date(lastSignIn) : null;
      if (lastActivity && lastActivity > sevenDaysAgo) return 'active';
      if (txCount > 0) return 'active';
      if (!lastActivity || lastActivity < thirtyDaysAgo) return 'zombie';
      return 'inactive';
    }

    const result = parents.map(p => {
      const children = (childrenMap.get(p.id) || []).map((c: any) => {
        const sub = subscriptionMap.get(c.id) || { has_upgrade: false, is_trial: false };
        return {
          id: c.id,
          nickname: decodeDisplayName(c.nickname),
          login_name: decodeDisplayName(c.login_name),
          role: c.role,
          store_count: parseInt(c.store_count),
          has_upgrade: sub.has_upgrade,
          is_trial: sub.is_trial,
          status: computeStatus(c.last_sign_in_at, txCountMap.get(c.id) || 0),
          last_sign_in_at: c.last_sign_in_at,
          created_at: c.created_at,
        };
      });

      const sub = subscriptionMap.get(p.id) || { has_upgrade: false, is_trial: false };
      return {
        id: p.id,
        nickname: decodeDisplayName(p.nickname),
        login_name: decodeDisplayName(p.login_name),
        role: p.role,
        store_count: parseInt(p.store_count),
        sub_account_count: parseInt(p.sub_account_count),
        has_upgrade: sub.has_upgrade,
        is_trial: sub.is_trial,
        status: computeStatus(p.last_sign_in_at, txCountMap.get(p.id) || 0),
        last_sign_in_at: p.last_sign_in_at,
        created_at: p.created_at,
        children,
      };
    });

    res.json({ parents: result });
  } catch (error) {
    console.error('Users hierarchy error:', error);
    res.status(500).json({ error: '获取用户层级失败', detail: String(error) });
  }
});

// User detail with stores
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = await queryOne<{
      id: string;
      login_name: string;
      display_name: string;
      role: string;
      register_source: string;
      created_at: string;
      last_sign_in_at: string;
    }>(`
      SELECT 
        p.id,
        COALESCE(u.email, u.phone, '-') as login_name,
        p.display_name,
        p.role,
        p.register_source,
        p.created_at,
        u.last_sign_in_at
      FROM user_profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.id = $1
    `, [userId]);

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const stores = await queryAll<{
      id: string;
      name: string;
      notes: string;
      created_at: string;
    }>(`
      SELECT id, name, notes, created_at
      FROM stores
      WHERE owner_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    const subAccounts = await queryAll<{
      id: string;
      display_name: string;
      created_at: string;
    }>(`
      SELECT id, display_name, created_at
      FROM user_profiles
      WHERE parent_user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    const subscription = await queryOne<{
      plan_type: string;
      status: string;
      started_at: string;
      expires_at: string;
    }>(`
      SELECT plan_type, status, started_at, expires_at
      FROM subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    const trialOrder = await queryOne<{ user_id: string }>(`
      SELECT user_id FROM subscription_orders 
      WHERE user_id = $1 AND order_id LIKE 'admin-trial-%' AND status = 'paid'
      LIMIT 1
    `, [userId]);

    const isActiveSub = subscription?.status === 'active' && (!subscription.expires_at || new Date(subscription.expires_at) > new Date());
    const isPro = subscription?.plan_type === 'pro';

    res.json({
      user: {
        ...user,
        nickname: decodeDisplayName(user.display_name),
        last_active_at: user.last_sign_in_at || user.created_at,
        status: (!user.last_sign_in_at || new Date(user.last_sign_in_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) ? 'zombie' : 'active',
        has_upgrade: Boolean(isPro && isActiveSub),
        is_trial: Boolean(isPro && isActiveSub && trialOrder),
      },
      stores,
      members: subAccounts,
      subscription,
    });
  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).json({ error: '获取用户详情失败', detail: String(error) });
  }
});

// Grant free trial to a user
router.post('/users/:id/grant-trial', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { days = 7 } = req.body;
    const durationDays = Math.min(365, Math.max(1, parseInt(days, 10) || 7));

    // Verify user exists
    const user = await queryOne<{ id: string }>(
      `SELECT id FROM user_profiles WHERE id = $1`,
      [userId]
    );

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    // Deactivate any existing active subscription
    await execute(
      `UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    // Insert new trial subscription
    await execute(
      `INSERT INTO subscriptions (user_id, plan_type, status, sub_account_limit, store_limit, started_at, expires_at, created_at, updated_at)
       VALUES ($1, 'pro', 'active', 9999, 9999, NOW(), NOW() + INTERVAL '${durationDays} days', NOW(), NOW())`,
      [userId]
    );

    // Insert a zero-amount order as trial marker
    await execute(
      `INSERT INTO subscription_orders (order_id, user_id, plan_type, period, amount, status, purchaser_id, description, created_at, paid_at, activated_at)
       VALUES ($1, $2, 'pro', 'trial', 0, 'paid', $2, '管理员开通免费试用', NOW(), NOW(), NOW())`,
      [`admin-trial-${Date.now()}`, userId]
    );

    res.json({ success: true, message: `已成功为该用户开通 ${durationDays} 天免费试用`, days: durationDays });
  } catch (error) {
    console.error('Grant trial error:', error);
    res.status(500).json({ error: '设置免费试用失败', detail: String(error) });
  }
});

// Stores list
router.get('/stores', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await queryOne<{ total: string }>(`SELECT COUNT(*) as total FROM stores`);
    const stores = await queryAll<{
      id: string;
      name: string;
      notes: string;
      owner_id: string;
      login_name: string;
      created_at: string;
      member_count: string;
      transaction_count: string;
    }>(`
      SELECT 
        s.id, s.name, s.notes, s.owner_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        s.created_at,
        (SELECT COUNT(*) FROM store_permissions WHERE store_id = s.id) as member_count,
        (SELECT COUNT(*) FROM transactions WHERE store_id = s.id) as transaction_count
      FROM stores s
      LEFT JOIN auth.users u ON u.id = s.owner_id
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      stores,
      pagination: {
        page,
        limit,
        total: parseInt(countResult?.total || '0', 10),
        totalPages: Math.ceil(parseInt(countResult?.total || '0', 10) / limit),
      },
    });
  } catch (error) {
    console.error('Stores list error:', error);
    res.status(500).json({ error: '获取店铺列表失败', detail: String(error) });
  }
});

// Categories list (unified by name/type)
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await queryAll<{
      name: string;
      type: string;
      icon: string;
      color: string;
      sort_order: number;
      usage_count: string;
      user_count: string;
    }>(`
      SELECT
        c.name,
        c.type,
        COALESCE(MODE() WITHIN GROUP (ORDER BY c.icon), '-') as icon,
        COALESCE(MODE() WITHIN GROUP (ORDER BY c.color), '#6b7280') as color,
        MIN(c.sort_order) as sort_order,
        SUM((SELECT COUNT(*) FROM transactions WHERE category_id = c.id)) as usage_count,
        COUNT(DISTINCT c.user_id) as user_count
      FROM categories c
      GROUP BY c.name, c.type
      ORDER BY c.type, sort_order, c.name
    `);

    res.json({ categories });
  } catch (error) {
    console.error('Categories list error:', error);
    res.status(500).json({ error: '获取分类列表失败', detail: String(error) });
  }
});

// Deduplicate categories per user
router.post('/categories/deduplicate', async (_req: Request, res: Response) => {
  try {
    // Update transactions to point to the kept category (min id per user/name/type)
    await execute(`
      UPDATE transactions t
      SET category_id = k.keep_id
      FROM (
        SELECT c.id as dup_id, MIN(c2.id) as keep_id
        FROM categories c
        JOIN categories c2 ON c.user_id = c2.user_id AND c.name = c2.name AND c.type = c2.type
        GROUP BY c.id
        HAVING c.id > MIN(c2.id)
      ) k
      WHERE t.category_id = k.dup_id
    `);

    // Delete duplicate categories
    const deleted = await queryAll<{ id: number }>(`
      DELETE FROM categories c
      WHERE EXISTS (
        SELECT 1 FROM categories c2
        WHERE c2.user_id = c.user_id AND c2.name = c.name AND c2.type = c.type AND c2.id < c.id
      )
      RETURNING c.id
    `);

    res.json({ success: true, deleted: deleted.length });
  } catch (error) {
    console.error('Categories deduplicate error:', error);
    res.status(500).json({ error: '清理重复分类失败', detail: String(error) });
  }
});

// Subscriptions list
router.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await queryOne<{ total: string }>(`SELECT COUNT(*) as total FROM subscriptions`);
    const subscriptions = await queryAll<{
      id: string;
      user_id: string;
      login_name: string;
      plan_type: string;
      status: string;
      started_at: string;
      expires_at: string;
      created_at: string;
    }>(`
      SELECT 
        s.id, s.user_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        s.plan_type, s.status, s.started_at, s.expires_at, s.created_at
      FROM subscriptions s
      LEFT JOIN auth.users u ON u.id = s.user_id
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      subscriptions,
      pagination: {
        page,
        limit,
        total: parseInt(countResult?.total || '0', 10),
        totalPages: Math.ceil(parseInt(countResult?.total || '0', 10) / limit),
      },
    });
  } catch (error) {
    console.error('Subscriptions list error:', error);
    res.status(500).json({ error: '获取订阅列表失败', detail: String(error) });
  }
});

// Subscription orders list
router.get('/subscription-orders', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || '';

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`so.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await queryOne<{ total: string }>(`
      SELECT COUNT(*) as total
      FROM subscription_orders so
      ${whereClause}
    `, params);

    const queryParams = [...params, limit, offset];
    const orders = await queryAll<{
      id: string;
      user_id: string;
      login_name: string;
      plan_type: string;
      period: string;
      amount: string;
      status: string;
      purchaser_id: string;
      description: string;
      created_at: string;
      paid_at: string;
      activated_at: string;
    }>(`
      SELECT
        so.id, so.user_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        so.plan_type, so.period, so.amount, so.status, so.purchaser_id,
        so.description, so.created_at, so.paid_at, so.activated_at
      FROM subscription_orders so
      LEFT JOIN auth.users u ON u.id = so.user_id
      ${whereClause}
      ORDER BY so.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, queryParams);

    res.json({
      orders,
      pagination: {
        page,
        limit,
        total: parseInt(countResult?.total || '0', 10),
        totalPages: Math.ceil(parseInt(countResult?.total || '0', 10) / limit),
      },
    });
  } catch (error) {
    console.error('Orders list error:', error);
    res.status(500).json({ error: '获取订单列表失败', detail: String(error) });
  }
});

// Feedback list
router.get('/feedback', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await queryOne<{ total: string }>(`SELECT COUNT(*) as total FROM feedback`);

    const feedback = await queryAll<{
      id: string;
      user_id: string;
      login_name: string;
      content: string;
      contact: string;
      created_at: string;
    }>(`
      SELECT 
        f.id, f.user_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        f.content, f.contact, f.created_at
      FROM feedback f
      LEFT JOIN auth.users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      feedback,
      pagination: {
        page,
        limit,
        total: parseInt(countResult?.total || '0', 10),
        totalPages: Math.ceil(parseInt(countResult?.total || '0', 10) / limit),
      },
    });
  } catch (error) {
    console.error('Feedback list error:', error);
    res.status(500).json({ error: '获取反馈列表失败', detail: String(error) });
  }
});

// Activity logs list
router.get('/activity-logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await queryOne<{ total: string }>(`SELECT COUNT(*) as total FROM activity_logs`);
    const logs = await queryAll<{
      id: string;
      user_id: string;
      login_name: string;
      activity_type: string;
      description: string;
      created_at: string;
    }>(`
      SELECT 
        al.id, al.user_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        al.activity_type, al.description, al.created_at
      FROM activity_logs al
      LEFT JOIN auth.users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total: parseInt(countResult?.total || '0', 10),
        totalPages: Math.ceil(parseInt(countResult?.total || '0', 10) / limit),
      },
    });
  } catch (error) {
    console.error('Activity logs error:', error);
    res.status(500).json({ error: '获取操作日志失败', detail: String(error) });
  }
});

// App versions list
router.get('/app-versions', async (req: Request, res: Response) => {
  try {
    const versions = await queryAll<{
      id: string;
      version: string;
      min_version: string;
      force_update: boolean;
      release_notes: string;
      download_url: string;
      created_at: string;
    }>(`
      SELECT id, version, min_version, force_update, release_notes, download_url, created_at
      FROM app_versions
      ORDER BY created_at DESC
    `);

    res.json({ versions });
  } catch (error) {
    console.error('App versions error:', error);
    res.status(500).json({ error: '获取应用版本失败', detail: String(error) });
  }
});

// Payment config
router.get('/payment-config', async (req: Request, res: Response) => {
  try {
    const config = await queryOne<{
      id: string;
      alipay_qrcode_url: string;
      wechat_qrcode_url: string;
      contact_info: string;
      updated_at: string;
    }>(`
      SELECT id, alipay_qrcode_url, wechat_qrcode_url, contact_info, updated_at
      FROM payment_config
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    if (!config) {
      res.json({
        id: null,
        alipay_qrcode_url: '',
        wechat_qrcode_url: '',
        contact_info: '',
        updated_at: null,
      });
      return;
    }

    res.json(config);
  } catch (error) {
    console.error('Payment config error:', error);
    res.status(500).json({ error: '获取支付配置失败', detail: String(error) });
  }
});

// Update payment config
router.put('/payment-config', async (req: Request, res: Response) => {
  try {
    const { alipay_qrcode_url, wechat_qrcode_url, contact_info } = req.body || {};

    const existing = await queryOne<{ id: string }>(`SELECT id FROM payment_config LIMIT 1`);

    if (existing) {
      await execute(
        `
          UPDATE payment_config
          SET alipay_qrcode_url = $1, wechat_qrcode_url = $2, contact_info = $3, updated_at = NOW()
          WHERE id = $4
        `,
        [alipay_qrcode_url || '', wechat_qrcode_url || '', contact_info || '', existing.id]
      );
    } else {
      await execute(
        `
          INSERT INTO payment_config (alipay_qrcode_url, wechat_qrcode_url, contact_info)
          VALUES ($1, $2, $3)
        `,
        [alipay_qrcode_url || '', wechat_qrcode_url || '', contact_info || '']
      );
    }

    res.json({ success: true, message: '支付配置已更新' });
  } catch (error) {
    console.error('Update payment config error:', error);
    res.status(500).json({ error: '更新支付配置失败', detail: String(error) });
  }
});

// Sync all data
router.post('/sync-all', async (req: Request, res: Response) => {
  const results: Record<string, any> = {};
  const startTime = Date.now();

  try {
    // 1. Sync users and activity logs
    const syncResult = await syncAllData();
    results.users = { synced: syncResult.usersSynced };
    results.activityLogs = { created: syncResult.activityLogsCreated };

    // 2. Sync display name history
    try {
      const historyResult = await queryOne<{ count: string }>(`
        SELECT COUNT(*) as count FROM display_name_history
      `);
      results.displayNameHistory = { count: parseInt(historyResult?.count || '0', 10) };
    } catch (e) {
      results.displayNameHistory = { error: String(e) };
    }

    // 3. Sync default categories if missing
    try {
      const defaultCategories = await queryCount(`
        SELECT COUNT(*) as count FROM categories
      `);
      results.defaultCategories = { count: defaultCategories };
    } catch (e) {
      results.defaultCategories = { error: String(e) };
    }

    // 4. Ensure payment config exists
    try {
      const paymentConfig = await queryOne<{ id: string }>(`SELECT id FROM payment_config LIMIT 1`);
      if (!paymentConfig) {
        await execute(
          `INSERT INTO payment_config (alipay_qrcode_url, wechat_qrcode_url, contact_info) VALUES ($1, $2, $3)`,
          ['', '', '']
        );
        results.paymentConfig = { created: true };
      } else {
        results.paymentConfig = { exists: true };
      }
    } catch (e) {
      results.paymentConfig = { error: String(e) };
    }

    // 5. Refresh materialized views or caches if any
    results.duration = Date.now() - startTime;

    res.json({
      success: true,
      message: '数据同步完成',
      results,
    });
  } catch (error) {
    console.error('Sync all error:', error);
    res.status(500).json({
      success: false,
      error: '数据同步失败',
      detail: String(error),
      results,
    });
  }
});

// ===================== Dashboard HTML =====================

const dashboardHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理后台</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: #667eea;
      --primary-dark: #5a67d8;
      --secondary: #764ba2;
      --bg: #f3f4f6;
      --card: #ffffff;
      --text: #1f2937;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      color: white;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
    }
    .header-title {
      font-size: 20px;
      font-weight: 700;
    }
    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-primary {
      background: white;
      color: var(--primary);
    }
    .btn-primary:hover { background: #f9fafb; }
    .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
    .btn-outline {
      background: transparent;
      color: white;
      border: 1px solid rgba(255,255,255,0.5);
    }
    .btn-outline:hover { background: rgba(255,255,255,0.1); }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-success {
      background: var(--success);
      color: white;
    }
    .btn-success:hover { background: #059669; }
    .btn-warning {
      background: var(--warning);
      color: white;
    }
    .btn-warning:hover { background: #d97706; }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 6px;
    }
    .btn-close {
      background: transparent;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #6b7280;
    }
    .container {
      display: flex;
      min-height: calc(100vh - 64px);
    }
    .sidebar {
      width: 220px;
      background: var(--card);
      border-right: 1px solid var(--border);
      padding: 16px 0;
      overflow-y: auto;
    }
    .nav-item {
      padding: 12px 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-muted);
      transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover {
      background: #f9fafb;
      color: var(--text);
    }
    .nav-item.active {
      background: #eef2ff;
      color: var(--primary);
      border-left-color: var(--primary);
      font-weight: 500;
    }
    .nav-icon { width: 20px; text-align: center; }
    .main {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }
    .page-title {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid var(--border);
    }
    .stat-label {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
    }
    .stat-change {
      font-size: 12px;
      margin-top: 6px;
    }
    .card {
      background: var(--card);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid var(--border);
      margin-bottom: 20px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
    }
    .toolbar {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .search-input {
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      min-width: 240px;
    }
    .search-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    .select {
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      background: white;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      color: var(--text-muted);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    tr:hover { background: #f9fafb; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-info { background: #dbeafe; color: #1e40af; }
    .badge-secondary { background: #f3f4f6; color: #6b7280; }
    .badge-default { background: #f3f4f6; color: #4b5563; }
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
    }
    .modal-content {
      position: relative;
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 560px;
      max-height: 85vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    }
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-title { font-size: 16px; font-weight: 600; }
    .modal-body {
      padding: 20px;
      overflow-y: auto;
    }
    .modal-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .pagination {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }
    .page-btn {
      padding: 6px 12px;
      border: 1px solid var(--border);
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .page-btn:hover { background: #f9fafb; }
    .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .page-info { font-size: 13px; color: var(--text-muted); }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    .loading {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hidden { display: none !important; }
    .sync-panel {
      background: #f9fafb;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .sync-result {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .sync-item {
      background: white;
      padding: 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .sync-item-label { font-size: 12px; color: var(--text-muted); }
    .sync-item-value { font-size: 18px; font-weight: 600; margin-top: 4px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    .form-input, .form-textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
    }
    .form-textarea { min-height: 80px; resize: vertical; }
    .form-input:focus, .form-textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    .qrcode-preview {
      max-width: 200px;
      max-height: 200px;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-top: 8px;
    }
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 14px 20px;
      border-radius: 10px;
      color: white;
      font-weight: 500;
      z-index: 1000;
      transform: translateX(150%);
      transition: transform 0.3s;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .toast.show { transform: translateX(0); }
    .toast-success { background: var(--success); }
    .toast-error { background: var(--danger); }
    .detail-grid { display: flex; flex-direction: column; gap: 12px; }
    .detail-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0; }
    .detail-label { font-size: 12px; color: var(--text-muted); }
    .detail-value { font-size: 14px; font-weight: 500; }
    .child-row td { border-bottom: 1px dashed var(--border); }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">管理后台</div>
    <div class="header-actions">
      <button class="btn btn-primary" id="syncBtn" onclick="showSyncPage()">
        <span id="syncIcon">🔄</span>
        <span id="syncText">同步数据</span>
      </button>
      <button class="btn btn-outline" onclick="logout()">退出登录</button>
    </div>
  </div>

  <div class="container">
    <div class="sidebar">
      <div class="nav-item active" data-page="overview" onclick="showPage('overview')">
        <span class="nav-icon">📊</span> 概览
      </div>
      <div class="nav-item" data-page="users" onclick="showPage('users')">
        <span class="nav-icon">👥</span> 用户管理
      </div>
      <div class="nav-item" data-page="stores" onclick="showPage('stores')">
        <span class="nav-icon">🏪</span> 店铺管理
      </div>
      <div class="nav-item" data-page="categories" onclick="showPage('categories')">
        <span class="nav-icon">🏷️</span> 分类管理
      </div>
      <div class="nav-item" data-page="subscriptions" onclick="showPage('subscriptions')">
        <span class="nav-icon">⭐</span> 订阅管理
      </div>
      <div class="nav-item" data-page="orders" onclick="showPage('orders')">
        <span class="nav-icon">📋</span> 订单记录
      </div>
      <div class="nav-item" data-page="feedback" onclick="showPage('feedback')">
        <span class="nav-icon">💬</span> 反馈建议
      </div>
      <div class="nav-item" data-page="logs" onclick="showPage('logs')">
        <span class="nav-icon">📝</span> 操作日志
      </div>
      <div class="nav-item" data-page="versions" onclick="showPage('versions')">
        <span class="nav-icon">📱</span> 应用版本
      </div>
      <div class="nav-item" data-page="payment" onclick="showPage('payment')">
        <span class="nav-icon">💳</span> 支付配置
      </div>
      <div class="nav-item" data-page="sync" onclick="showPage('sync')">
        <span class="nav-icon">🔄</span> 数据同步
      </div>
    </div>

    <div class="main" id="mainContent">
      <!-- Pages will be rendered here -->
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const API_BASE = '/api/v1/admin';
    const state = {
      currentPage: 'overview',
      pageData: {},
    };

    function getToken() {
      return localStorage.getItem('adminToken');
    }

    async function apiRequest(path, options = {}) {
      const res = await fetch(API_BASE + path, {
        ...options,
        headers: {
          'x-admin-token': getToken(),
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        window.location.href = '/api/v1/admin/login';
        return;
      }
      return res;
    }

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast toast-' + type + ' show';
      setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }

    function logout() {
      localStorage.removeItem('adminToken');
      window.location.href = '/api/v1/admin/login';
    }

    function showPage(page) {
      state.currentPage = page;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelector('[data-page="' + page + '"]').classList.add('active');

      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载中...</div>';

      switch (page) {
        case 'overview': renderOverview(); break;
        case 'users': renderUsers(); break;
        case 'stores': renderStores(); break;
        case 'categories': renderCategories(); break;
        case 'subscriptions': renderSubscriptions(); break;
        case 'orders': renderOrders(); break;
        case 'feedback': renderFeedback(); break;
        case 'logs': renderLogs(); break;
        case 'versions': renderVersions(); break;
        case 'payment': renderPayment(); break;
        case 'sync': renderSync(); break;
      }
    }

    function showSyncPage() {
      showPage('sync');
    }

    function formatMoney(amount) {
      if (amount === null || amount === undefined) return '-';
      const num = parseFloat(amount);
      if (isNaN(num)) return '-';
      return '¥' + num.toFixed(2);
    }

    function formatDate(date) {
      if (!date) return '-';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    }

    function escapeHtml(text) {
      if (text === null || text === undefined) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function getRoleBadge(role) {
      if (role === 'owner') return '<span class="badge badge-success">主账号</span>';
      if (role === 'member') return '<span class="badge badge-info">子账号</span>';
      return '<span class="badge badge-default">' + escapeHtml(role) + '</span>';
    }

    function renderPagination(containerId, page, limit, total, onPageChange) {
      const totalPages = Math.ceil(total / limit) || 1;
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = '';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'page-btn';
      prevBtn.textContent = '上一页';
      prevBtn.disabled = page <= 1;
      prevBtn.onclick = () => onPageChange(page - 1);
      el.appendChild(prevBtn);

      const info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = '第 ' + page + ' / ' + totalPages + ' 页，共 ' + total + ' 条';
      el.appendChild(info);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'page-btn';
      nextBtn.textContent = '下一页';
      nextBtn.disabled = page >= totalPages;
      nextBtn.onclick = () => onPageChange(page + 1);
      el.appendChild(nextBtn);
    }

    // ================= Overview =================
    async function renderOverview() {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载统计数据...</div>';

      try {
        const res = await apiRequest('/dashboard-data');
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">数据概览</div>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">总用户</div>
              <div class="stat-value">\${data.totalUsers || 0}</div>
              <div class="stat-change">主账号 \${data.ownerCount || 0} / 子账号 \${data.memberCount || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">店铺总数</div>
              <div class="stat-value">\${data.storeCount || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">交易记录</div>
              <div class="stat-value">\${data.transactionCount || 0}</div>
              <div class="stat-change">收入 \${formatMoney(data.totalIncome)} / 支出 \${formatMoney(data.totalExpense)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">订阅用户</div>
              <div class="stat-value">\${data.subscriptionCount || 0}</div>
              <div class="stat-change">Pro \${data.proCount || 0} / Free \${data.freeCount || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">订单收入</div>
              <div class="stat-value">\${formatMoney(data.orderRevenue)}</div>
              <div class="stat-change">已付订单 \${data.paidOrderCount || 0} / 总订单 \${data.orderCount || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">今日收入</div>
              <div class="stat-value">\${formatMoney(data.revenueToday)}</div>
              <div class="stat-change">本月 \${formatMoney(data.revenueThisMonth)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">反馈建议</div>
              <div class="stat-value">\${data.feedbackCount || 0}</div>
              <div class="stat-change">总计 \${data.feedbackCount || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">24小时活跃用户</div>
              <div class="stat-value">\${data.activeUsersToday || 0}</div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">快速入口</div>
            </div>
            <div class="toolbar">
              <button class="btn btn-primary" onclick="showPage('users')">用户管理</button>
              <button class="btn btn-primary" onclick="showPage('payment')">支付配置</button>
              <button class="btn btn-primary" onclick="showPage('sync')">数据同步</button>
            </div>
          </div>
        \`;
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    // ================= Users =================
    async function renderUsers() {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载用户数据...</div>';

      try {
        const res = await apiRequest('/users/hierarchy');
        const data = await res.json();
        renderUsersTable(data.parents || []);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function toggleChildren(parentId) {
      const rows = document.querySelectorAll('.child-of-' + parentId);
      const toggle = document.getElementById('toggle-' + parentId);
      if (!rows.length) return;
      const isHidden = rows[0].style.display === 'none';
      rows.forEach(r => { r.style.display = isHidden ? '' : 'none'; });
      if (toggle) toggle.textContent = isHidden ? '▼' : '▶';
    }

    function getStatusBadge(status) {
      if (status === 'active') return '<span class="badge badge-success">活跃</span>';
      if (status === 'zombie') return '<span class="badge badge-danger">僵尸</span>';
      return '<span class="badge badge-warning">一般</span>';
    }

    function getPlanBadge(user) {
      if (user.is_trial) return '<span class="badge badge-info">试用中</span>';
      if (user.has_upgrade) return '<span class="badge badge-success">已购买</span>';
      return '<span class="badge badge-secondary">免费版</span>';
    }

    function renderUsersTable(parents) {
      const main = document.getElementById('mainContent');

      if (!parents || parents.length === 0) {
        main.innerHTML = '<div class="empty-state">暂无用户数据</div>';
        return;
      }

      const rows = parents.map(p => {
        const childRows = (p.children || []).map(c => \`
          <tr class="child-row child-of-\${p.id}" style="display:none;background:#fafbfc;">
            <td style="padding-left:44px;">↳ \${escapeHtml(c.nickname)}</td>
            <td>\${escapeHtml(c.login_name)}</td>
            <td>\${c.store_count || 0}</td>
            <td>-</td>
            <td>\${getPlanBadge(c)}</td>
            <td>\${getStatusBadge(c.status)}</td>
            <td>\${formatDate(c.created_at)}</td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="showUserDetail('\${c.id}')">详情</button>
              \${c.has_upgrade ? '' : \`<button class="btn btn-sm btn-success" onclick="grantTrial('\${c.id}')">免费体验</button>\`}
            </td>
          </tr>
        \`).join('');

        return \`
          <tr>
            <td>
              \${p.sub_account_count > 0 ? \`<button class="btn btn-sm btn-outline" id="toggle-\${p.id}" onclick="toggleChildren('\${p.id}')" style="margin-right:6px;">▶</button>\` : ''}
              \${escapeHtml(p.nickname)}
            </td>
            <td>\${escapeHtml(p.login_name)}</td>
            <td>\${p.store_count || 0}</td>
            <td>\${p.sub_account_count || 0}</td>
            <td>\${getPlanBadge(p)}</td>
            <td>\${getStatusBadge(p.status)}</td>
            <td>\${formatDate(p.created_at)}</td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="showUserDetail('\${p.id}')">详情</button>
              \${p.has_upgrade ? '' : \`<button class="btn btn-sm btn-success" onclick="grantTrial('\${p.id}')">免费体验</button>\`}
            </td>
          </tr>
          \${childRows}
        \`;
      }).join('');

      main.innerHTML = \`
        <div class="page-title">用户管理</div>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>显示名称</th>
                <th>登录账号</th>
                <th>店铺数</th>
                <th>子账号数</th>
                <th>功能状态</th>
                <th>活跃度</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              \${rows}
            </tbody>
          </table>
        </div>

        <!-- User Detail Modal -->
        <div id="userModal" class="modal" style="display:none;">
          <div class="modal-backdrop" onclick="closeUserModal()"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h3>用户详情</h3>
              <button class="btn-close" onclick="closeUserModal()">✕</button>
            </div>
            <div id="userModalBody" class="modal-body">加载中...</div>
            <div class="modal-footer">
              <button class="btn btn-secondary" onclick="closeUserModal()">关闭</button>
            </div>
          </div>
        </div>
      \`;
    }

    async function showUserDetail(userId) {
      const modal = document.getElementById('userModal');
      const body = document.getElementById('userModalBody');
      if (!modal || !body) return;
      modal.style.display = 'flex';
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">加载中...</div>';

      try {
        const res = await apiRequest('/users/' + userId);
        const data = await res.json();
        const u = data.user;

        body.innerHTML = \`
          <div class="detail-grid">
            <div class="detail-row"><span class="detail-label">显示名称</span><span class="detail-value">\${escapeHtml(u.nickname)}</span></div>
            <div class="detail-row"><span class="detail-label">登录账号</span><span class="detail-value">\${escapeHtml(u.login_name)}</span></div>
            <div class="detail-row"><span class="detail-label">用户ID</span><span class="detail-value" style="font-family:monospace;font-size:12px;">\${u.id}</span></div>
            <div class="detail-row"><span class="detail-label">角色</span><span class="detail-value">\${u.role === 'parent' ? '<span class="badge badge-info">主账号</span>' : '<span class="badge badge-default">子账号</span>'}</span></div>
            <div class="detail-row"><span class="detail-label">注册时间</span><span class="detail-value">\${formatDate(u.created_at)}</span></div>
            <div class="detail-row"><span class="detail-label">最后登录</span><span class="detail-value">\${formatDate(u.last_sign_in_at)}</span></div>
            <div class="detail-row"><span class="detail-label">功能状态</span><span class="detail-value">\${getPlanBadge(u)}</span></div>
            <div class="detail-row"><span class="detail-label">活跃度</span><span class="detail-value">\${getStatusBadge(u.status)}</span></div>
          </div>

          <h4 style="margin:20px 0 10px;font-size:14px;font-weight:600;">店铺列表 (\${data.stores.length})</h4>
          \${data.stores.length === 0 ? '<p style="color:#6b7280;font-size:13px;">暂无店铺</p>' : \`
            <table style="margin-top:8px;">
              <thead><tr><th>店铺名称</th><th>创建时间</th></tr></thead>
              <tbody>
                \${data.stores.map(s => \`<tr><td>\${escapeHtml(s.name)}</td><td>\${formatDate(s.created_at)}</td></tr>\`).join('')}
              </tbody>
            </table>
          \`}

          <h4 style="margin:20px 0 10px;font-size:14px;font-weight:600;">子账号 (\${data.members.length})</h4>
          \${data.members.length === 0 ? '<p style="color:#6b7280;font-size:13px;">暂无子账号</p>' : \`
            <table style="margin-top:8px;">
              <thead><tr><th>显示名称</th><th>登录账号</th><th>关系</th></tr></thead>
              <tbody>
                \${data.members.map(m => \`<tr><td>\${escapeHtml(m.nickname)}</td><td>\${escapeHtml(m.login_name)}</td><td>\${escapeHtml(m.relation || '-')}</td></tr>\`).join('')}
              </tbody>
            </table>
          \`}
        \`;
      } catch (err) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function closeUserModal() {
      const modal = document.getElementById('userModal');
      if (modal) modal.style.display = 'none';
    }

    async function grantTrial(userId) {
      const days = prompt('请输入免费体验天数：', '7');
      if (!days) return;
      const numDays = parseInt(days);
      if (isNaN(numDays) || numDays < 1 || numDays > 365) {
        showToast('请输入 1-365 之间的天数', 'error');
        return;
      }

      try {
        const res = await apiRequest('/users/' + userId + '/grant-trial', {
          method: 'POST',
          body: JSON.stringify({ days: numDays }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('已开通 ' + numDays + ' 天免费体验，到期时间：' + formatDate(data.expires_at));
          renderUsers();
        } else {
          showToast(data.error || '操作失败', 'error');
        }
      } catch (err) {
        showToast('操作失败: ' + err.message, 'error');
      }
    }

    // ================= Stores =================
    async function renderStores(page = 1) {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载店铺数据...</div>';

      try {
        const res = await apiRequest('/stores?page=' + page + '&limit=20');
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">店铺管理</div>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>店铺名称</th>
                  <th>所属账号</th>
                  <th>备注</th>
                  <th>成员数</th>
                  <th>交易数</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                \${data.stores.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.stores.map(s => \`
                  <tr>
                    <td>\${escapeHtml(s.name)}</td>
                    <td>\${escapeHtml(s.login_name)}</td>
                    <td>\${escapeHtml(s.notes || '-')}</td>
                    <td>\${s.member_count || 0}</td>
                    <td>\${s.transaction_count || 0}</td>
                    <td>\${formatDate(s.created_at)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div class="pagination" id="storesPagination"></div>
          </div>
        \`;

        renderPagination('storesPagination', data.pagination.page, data.pagination.limit, data.pagination.total, renderStores);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    // ================= Categories =================
    async function renderCategories() {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载分类数据...</div>';

      try {
        const res = await apiRequest('/categories');
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">分类管理</div>
          <div class="card">
            <div class="card-header">
              <div class="card-title">统一分类视图</div>
              <button class="btn btn-sm btn-warning" onclick="deduplicateCategories()">清理重复分类</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>图标</th>
                  <th>颜色</th>
                  <th>使用次数</th>
                  <th>使用用户数</th>
                </tr>
              </thead>
              <tbody>
                \${data.categories.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.categories.map(c => \`
                  <tr>
                    <td>\${escapeHtml(c.name)}</td>
                    <td>\${c.type === 'income' ? '<span class="badge badge-success">收入</span>' : '<span class="badge badge-danger">支出</span>'}</td>
                    <td>\${escapeHtml(c.icon || '-')}</td>
                    <td><span style="display:inline-block;width:20px;height:20px;background:\${escapeHtml(c.color || '#ccc')};border-radius:4px;vertical-align:middle;"></span> \${escapeHtml(c.color || '-')}</td>
                    <td>\${c.usage_count || 0}</td>
                    <td>\${c.user_count || 0}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    async function deduplicateCategories() {
      if (!confirm('确定要清理重复分类吗？相同用户下同名同类型的分类将被合并，相关交易记录会转移到保留的分类上。')) return;
      try {
        const res = await apiRequest('/categories/deduplicate', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast('已清理 ' + (data.deleted || 0) + ' 条重复分类');
          renderCategories();
        } else {
          showToast(data.error || '清理失败', 'error');
        }
      } catch (err) {
        showToast('清理失败: ' + err.message, 'error');
      }
    }

    // ================= Subscriptions =================
    async function renderSubscriptions(page = 1) {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载订阅数据...</div>';

      try {
        const res = await apiRequest('/subscriptions?page=' + page + '&limit=20');
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">订阅管理</div>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>套餐</th>
                  <th>状态</th>
                  <th>开始时间</th>
                  <th>到期时间</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                \${data.subscriptions.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.subscriptions.map(s => \`
                  <tr>
                    <td>\${escapeHtml(s.login_name)}</td>
                    <td>\${escapeHtml(s.plan_type)}</td>
                    <td>\${s.status === 'active' ? '<span class="badge badge-success">有效</span>' : '<span class="badge badge-warning">' + escapeHtml(s.status) + '</span>'}</td>
                    <td>\${formatDate(s.started_at)}</td>
                    <td>\${formatDate(s.expires_at)}</td>
                    <td>\${formatDate(s.created_at)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div class="pagination" id="subscriptionsPagination"></div>
          </div>
        \`;

        renderPagination('subscriptionsPagination', data.pagination.page, data.pagination.limit, data.pagination.total, renderSubscriptions);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    // ================= Orders =================
    async function renderOrders(page = 1) {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载订单数据...</div>';

      const status = state.pageData.ordersStatus || '';

      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (status) params.set('status', status);

        const res = await apiRequest('/subscription-orders?' + params.toString());
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">订单记录</div>
          <div class="card">
            <div class="toolbar">
              <select class="select" id="ordersStatus">
                <option value="">全部状态</option>
                <option value="pending" \${status === 'pending' ? 'selected' : ''}>待支付</option>
                <option value="paid" \${status === 'paid' ? 'selected' : ''}>已支付</option>
                <option value="cancelled" \${status === 'cancelled' ? 'selected' : ''}>已取消</option>
              </select>
              <button class="btn btn-primary" onclick="searchOrders()">筛选</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>套餐</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>支付方式</th>
                  <th>时长</th>
                  <th>创建时间</th>
                  <th>支付时间</th>
                </tr>
              </thead>
              <tbody>
                \${data.orders.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.orders.map(o => \`
                  <tr>
                    <td>\${escapeHtml(o.login_name)}</td>
                    <td>\${escapeHtml(o.plan_type)}</td>
                    <td>\${formatMoney(o.amount)}</td>
                    <td>\${
                      o.status === 'paid' ? '<span class="badge badge-success">已支付</span>' :
                      o.status === 'pending' ? '<span class="badge badge-warning">待支付</span>' :
                      '<span class="badge badge-default">' + escapeHtml(o.status) + '</span>'
                    }</td>
                    <td>\${escapeHtml(o.payment_method || '-')}</td>
                    <td>\${o.duration_months || '-'} 个月</td>
                    <td>\${formatDate(o.created_at)}</td>
                    <td>\${formatDate(o.paid_at)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div class="pagination" id="ordersPagination"></div>
          </div>
        \`;

        renderPagination('ordersPagination', data.pagination.page, data.pagination.limit, data.pagination.total, renderOrders);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function searchOrders() {
      state.pageData.ordersStatus = document.getElementById('ordersStatus').value;
      renderOrders(1);
    }

    // ================= Feedback =================
    async function renderFeedback(page = 1) {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载反馈数据...</div>';

      const status = state.pageData.feedbackStatus || '';

      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (status) params.set('status', status);

        const res = await apiRequest('/feedback?' + params.toString());
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">反馈建议</div>
          <div class="card">
            <div class="toolbar">
              <select class="select" id="feedbackStatus">
                <option value="">全部状态</option>
                <option value="pending" \${status === 'pending' ? 'selected' : ''}>待处理</option>
                <option value="resolved" \${status === 'resolved' ? 'selected' : ''}>已处理</option>
              </select>
              <button class="btn btn-primary" onclick="searchFeedback()">筛选</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>内容</th>
                  <th>联系方式</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                \${data.feedback.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.feedback.map(f => \`
                  <tr>
                    <td>\${escapeHtml(f.login_name)}</td>
                    <td>\${escapeHtml(f.content)}</td>
                    <td>\${escapeHtml(f.contact || '-')}</td>
                    <td>\${formatDate(f.created_at)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div class="pagination" id="feedbackPagination"></div>
          </div>
        \`;

        renderPagination('feedbackPagination', data.pagination.page, data.pagination.limit, data.pagination.total, renderFeedback);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function searchFeedback() {
      state.pageData.feedbackStatus = document.getElementById('feedbackStatus').value;
      renderFeedback(1);
    }

    // ================= Logs =================
    async function renderLogs(page = 1) {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载日志数据...</div>';

      try {
        const res = await apiRequest('/activity-logs?page=' + page + '&limit=20');
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">操作日志</div>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>操作类型</th>
                  <th>描述</th>
                  <th>IP</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                \${data.logs.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.logs.map(l => \`
                  <tr>
                    <td>\${escapeHtml(l.login_name)}</td>
                    <td>\${escapeHtml(l.activity_type)}</td>
                    <td>\${escapeHtml(l.description || '-')}</td>
                    <td>\${escapeHtml(l.ip_address || '-')}</td>
                    <td>\${formatDate(l.created_at)}</td>
                  </tr>
                \`).join('')}

              </tbody>
            </table>
            <div class="pagination" id="logsPagination"></div>
          </div>
        \`;

        renderPagination('logsPagination', data.pagination.page, data.pagination.limit, data.pagination.total, renderLogs);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    // ================= Versions =================
    async function renderVersions() {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载版本数据...</div>';

      try {
        const res = await apiRequest('/app-versions');
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">应用版本</div>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>版本号</th>
                  <th>最低版本</th>
                  <th>强制更新</th>
                  <th>下载地址</th>
                  <th>更新说明</th>
                  <th>发布时间</th>
                </tr>
              </thead>
              <tbody>
                \${data.versions.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.versions.map(v => \`
                  <tr>
                    <td>\${escapeHtml(v.version)}</td>
                    <td>\${escapeHtml(v.platform)}</td>
                    <td>\${v.force_update ? '<span class="badge badge-danger">是</span>' : '<span class="badge badge-default">否</span>'}</td>
                    <td><a href="\${escapeHtml(v.download_url)}" target="_blank">下载</a></td>
                    <td>\${escapeHtml(v.release_notes || '-')}</td>
                    <td>\${formatDate(v.created_at)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    // ================= Payment Config =================
    async function renderPayment() {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载支付配置...</div>';

      try {
        const res = await apiRequest('/payment-config');
        const config = await res.json();

        main.innerHTML = \`
          <div class="page-title">支付配置</div>
          <div class="card">
            <div class="form-group">
              <label class="form-label">支付宝收款二维码 URL</label>
              <input type="text" class="form-input" id="alipayUrl" value="\${escapeHtml(config.alipay_qrcode_url || '')}" placeholder="请输入支付宝二维码图片地址">
              <div id="alipayPreview">
                \${config.alipay_qrcode_url ? '<img src="' + escapeHtml(config.alipay_qrcode_url) + '" class="qrcode-preview" onerror="this.style.display=\\'none\\'">' : ''}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">微信收款二维码 URL</label>
              <input type="text" class="form-input" id="wechatUrl" value="\${escapeHtml(config.wechat_qrcode_url || '')}" placeholder="请输入微信二维码图片地址">
              <div id="wechatPreview">
                \${config.wechat_qrcode_url ? '<img src="' + escapeHtml(config.wechat_qrcode_url) + '" class="qrcode-preview" onerror="this.style.display=\\'none\\'">' : ''}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">客服联系方式</label>
              <textarea class="form-textarea" id="contactInfo" placeholder="请输入客服微信、电话或其他联系方式">\${escapeHtml(config.contact_info || '')}</textarea>
            </div>
            <button class="btn btn-primary" onclick="savePaymentConfig()">保存配置</button>
          </div>
        \`;
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    async function savePaymentConfig() {
      const btn = document.querySelector('button[onclick="savePaymentConfig()"]');
      btn.disabled = true;
      btn.textContent = '保存中...';

      try {
        const res = await apiRequest('/payment-config', {
          method: 'PUT',
          body: JSON.stringify({
            alipay_qrcode_url: document.getElementById('alipayUrl').value,
            wechat_qrcode_url: document.getElementById('wechatUrl').value,
            contact_info: document.getElementById('contactInfo').value,
          }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showToast('支付配置已保存');
          renderPayment();
        } else {
          throw new Error(data.error || '保存失败');
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '保存配置';
      }
    }

    // ================= Sync =================
    function renderSync() {
      const main = document.getElementById('mainContent');
      main.innerHTML = \`
        <div class="page-title">数据同步</div>
        <div class="card">
          <p style="color:var(--text-muted);margin-bottom:16px;">点击同步按钮，系统会从 auth.users 同步用户信息到 user_profiles，并补齐相关关联数据。</p>
          <button class="btn btn-primary" id="doSyncBtn" onclick="doSync()">
            <span id="doSyncIcon">🔄</span>
            <span id="doSyncText">开始同步</span>
          </button>
          <div id="syncResult" style="margin-top:20px;"></div>
        </div>
      \`;
    }

    async function doSync() {
      const btn = document.getElementById('doSyncBtn');
      const icon = document.getElementById('doSyncIcon');
      const text = document.getElementById('doSyncText');
      const result = document.getElementById('syncResult');

      btn.disabled = true;
      text.textContent = '同步中...';
      icon.innerHTML = '<span class="loading"></span>';
      result.innerHTML = '<div style="color:var(--text-muted);">正在同步，请稍候...</div>';

      try {
        const res = await apiRequest('/sync-all', { method: 'POST' });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || '同步失败');
        }

        const r = data.results || {};
        result.innerHTML = \`
          <div style="color:var(--success);font-weight:600;margin-bottom:12px;">✅ 同步完成（耗时 \${r.duration || 0}ms）</div>
          <div class="sync-result">
            <div class="sync-item">
              <div class="sync-item-label">同步用户</div>
              <div class="sync-item-value">\${r.users?.synced || 0}</div>
            </div>
            <div class="sync-item">
              <div class="sync-item-label">活动日志</div>
              <div class="sync-item-value">\${r.activityLogs?.created || 0}</div>
            </div>
            <div class="sync-item">
              <div class="sync-item-label">显示名历史</div>
              <div class="sync-item-value">\${r.displayNameHistory?.count || 0}</div>
            </div>
            <div class="sync-item">
              <div class="sync-item-label">默认分类</div>
              <div class="sync-item-value">\${r.defaultCategories?.count || 0}</div>
            </div>
            <div class="sync-item">
              <div class="sync-item-label">支付配置</div>
              <div class="sync-item-value">\${r.paymentConfig?.created ? '已创建' : '已存在'}</div>
            </div>
          </div>
        \`;
        showToast('数据同步完成');
      } catch (err) {
        result.innerHTML = '<div style="color:var(--danger);">❌ ' + escapeHtml(err.message) + '</div>';
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        text.textContent = '开始同步';
        icon.textContent = '🔄';
      }
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      const token = getToken();
      if (!token) {
        window.location.href = '/api/v1/admin/login';
        return;
      }
      showPage('overview');
    });
  </script>
</body>
</html>`;

export { adminLoginRouter, router as default };
