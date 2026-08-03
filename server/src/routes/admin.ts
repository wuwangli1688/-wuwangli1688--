import express, { type Request, type Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
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
const JWT_SECRET = process.env.JWT_SECRET || 'default-admin-jwt-secret-change-me';

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

// Generate admin JWT token
function generateAdminToken(): string {
  const now = Date.now();
  const payload = {
    role: 'admin',
    timestamp: now,
    exp: Math.floor(now / 1000) + 24 * 60 * 60,
  };
  return jwt.sign(payload, JWT_SECRET);
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
  <title>开发者后台登录</title>
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
    <div class="login-title">开发者后台</div>
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
      queryOne<{ total: string; owners: string; members: string }>(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE role = 'owner') as owners,
          COUNT(*) FILTER (WHERE role = 'member') as members
        FROM user_profiles
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

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(u.login_name ILIKE $${paramIndex} OR p.display_name ILIKE $${paramIndex})`);
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = params.slice();

    const countResult = await queryOne<{ total: string }>(`
      SELECT COUNT(*) as total
      FROM user_profiles p
      LEFT JOIN auth.users u ON u.id = p.user_id
      ${whereClause}
    `, countParams);

    const queryParams = [...params, limit, offset];
    const users = await queryAll<{
      user_id: string;
      login_name: string;
      display_name: string;
      role: string;
      register_source: string;
      created_at: string;
      updated_at: string;
      last_active_at: string;
      subscription_status: string;
      plan_type: string;
      store_count: string;
      transaction_count: string;
    }>(`
      SELECT 
        p.user_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        p.display_name,
        p.role,
        p.register_source,
        p.created_at,
        p.updated_at,
        p.last_active_at,
        s.status as subscription_status,
        s.plan_type,
        (SELECT COUNT(*) FROM stores WHERE owner_id = p.user_id) as store_count,
        (SELECT COUNT(*) FROM transactions WHERE user_id = p.user_id) as transaction_count
      FROM user_profiles p
      LEFT JOIN auth.users u ON u.id = p.user_id
      LEFT JOIN subscriptions s ON s.user_id = p.user_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, queryParams);

    const formattedUsers = users.map(u => ({
      ...u,
      display_name: decodeDisplayName(u.display_name),
      store_count: parseInt(u.store_count || '0', 10),
      transaction_count: parseInt(u.transaction_count || '0', 10),
    }));

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

// User detail with stores
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = await queryOne<{
      user_id: string;
      login_name: string;
      display_name: string;
      role: string;
      register_source: string;
      created_at: string;
      updated_at: string;
      last_active_at: string;
    }>(`
      SELECT 
        p.user_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        p.display_name,
        p.role,
        p.register_source,
        p.created_at,
        p.updated_at,
        p.last_active_at
      FROM user_profiles p
      LEFT JOIN auth.users u ON u.id = p.user_id
      WHERE p.user_id = $1
    `, [userId]);

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const stores = await queryAll<{
      id: string;
      name: string;
      address: string;
      phone: string;
      created_at: string;
    }>(`
      SELECT id, name, address, phone, created_at
      FROM stores
      WHERE owner_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    const memberStores = await queryAll<{
      id: string;
      name: string;
      role: string;
      created_at: string;
    }>(`
      SELECT s.id, s.name, sp.role, sp.created_at
      FROM store_permissions sp
      JOIN stores s ON s.id = sp.store_id
      WHERE sp.user_id = $1
      ORDER BY sp.created_at DESC
    `, [userId]);

    const transactions = await queryAll<{
      id: string;
      amount: string;
      type: string;
      category_name: string;
      transaction_date: string;
      description: string;
    }>(`
      SELECT t.id, t.amount, t.type, c.name as category_name, t.date as transaction_date, t.note as description
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = $1
      ORDER BY t.date DESC
      LIMIT 20
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

    res.json({
      ...user,
      display_name: decodeDisplayName(user.display_name),
      stores,
      memberStores,
      transactions,
      subscription,
    });
  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).json({ error: '获取用户详情失败', detail: String(error) });
  }
});

// Transactions list
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const type = (req.query.type as string) || '';

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(u.email ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (type) {
      conditions.push(`t.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await queryOne<{ total: string }>(`
      SELECT COUNT(*) as total
      FROM transactions t
      LEFT JOIN auth.users u ON u.id = t.user_id
      ${whereClause}
    `, params);

    const queryParams = [...params, limit, offset];
    const transactions = await queryAll<{
      id: string;
      user_id: string;
      login_name: string;
      amount: string;
      type: string;
      category_name: string;
      store_name: string;
      transaction_date: string;
      description: string;
      created_at: string;
    }>(`
      SELECT 
        t.id,
        t.user_id,
        COALESCE(u.email, u.phone, '-') as login_name,
        t.amount,
        t.type,
        c.name as category_name,
        s.name as store_name,
        t.date as transaction_date,
        t.note AS description,
        t.created_at
      FROM transactions t
      LEFT JOIN auth.users u ON u.id = t.user_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN stores s ON s.id = t.store_id
      ${whereClause}
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, queryParams);

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total: parseInt(countResult?.total || '0', 10),
        totalPages: Math.ceil(parseInt(countResult?.total || '0', 10) / limit),
      },
    });
  } catch (error) {
    console.error('Transactions list error:', error);
    res.status(500).json({ error: '获取交易记录失败', detail: String(error) });
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

// Categories list
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await queryAll<{
      id: string;
      name: string;
      type: string;
      icon: string;
      color: string;
      sort_order: number;
      created_at: string;
      usage_count: string;
    }>(`
      SELECT
        c.id, c.name, c.type, c.icon, c.color, c.sort_order, c.created_at,
        (SELECT COUNT(*) FROM transactions WHERE category_id = c.id) as usage_count
      FROM categories c
      ORDER BY c.type, c.sort_order, c.name
    `);

    res.json({ categories });
  } catch (error) {
    console.error('Categories list error:', error);
    res.status(500).json({ error: '获取分类列表失败', detail: String(error) });
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
  <title>开发者后台</title>
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
    .badge-default { background: #f3f4f6; color: #4b5563; }
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
    .detail-row { margin-bottom: 10px; }
    .detail-label { font-size: 12px; color: var(--text-muted); }
    .detail-value { font-size: 14px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">开发者后台</div>
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
      <div class="nav-item" data-page="transactions" onclick="showPage('transactions')">
        <span class="nav-icon">💰</span> 交易记录
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
        case 'transactions': renderTransactions(); break;
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
              <button class="btn btn-primary" onclick="showPage('transactions')">交易记录</button>
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
    async function renderUsers(page = 1) {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载用户数据...</div>';

      const search = state.pageData.usersSearch || '';
      const role = state.pageData.usersRole || '';

      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (search) params.set('search', search);
        if (role) params.set('role', role);

        const res = await apiRequest('/users?' + params.toString());
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">用户管理</div>
          <div class="card">
            <div class="toolbar">
              <input type="text" class="search-input" id="usersSearch" placeholder="搜索账号 / 显示名" value="\${escapeHtml(search)}">
              <select class="select" id="usersRole">
                <option value="">全部角色</option>
                <option value="owner" \${role === 'owner' ? 'selected' : ''}>主账号</option>
                <option value="member" \${role === 'member' ? 'selected' : ''}>子账号</option>
              </select>
              <button class="btn btn-primary" onclick="searchUsers()">搜索</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>登录账号</th>
                  <th>显示名</th>
                  <th>角色</th>
                  <th>店铺数</th>
                  <th>交易数</th>
                  <th>套餐</th>
                  <th>注册来源</th>
                  <th>注册时间</th>
                </tr>
              </thead>
              <tbody>
                \${data.users.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.users.map(u => \`
                  <tr>
                    <td>\${escapeHtml(u.login_name)}</td>
                    <td>\${escapeHtml(u.display_name)}</td>
                    <td>\${getRoleBadge(u.role)}</td>
                    <td>\${u.store_count || 0}</td>
                    <td>\${u.transaction_count || 0}</td>
                    <td>\${escapeHtml(u.plan_type || '-')} \${u.subscription_status ? '<span class="badge badge-' + (u.subscription_status === 'active' ? 'success' : 'warning') + '">' + escapeHtml(u.subscription_status) + '</span>' : ''}</td>
                    <td>\${escapeHtml(u.register_source || '-')}</td>
                    <td>\${formatDate(u.created_at)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div class="pagination" id="usersPagination"></div>
          </div>
        \`;

        renderPagination('usersPagination', data.pagination.page, data.pagination.limit, data.pagination.total, renderUsers);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function searchUsers() {
      state.pageData.usersSearch = document.getElementById('usersSearch').value;
      state.pageData.usersRole = document.getElementById('usersRole').value;
      renderUsers(1);
    }

    // ================= Transactions =================
    async function renderTransactions(page = 1) {
      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state">加载交易数据...</div>';

      const search = state.pageData.transactionsSearch || '';
      const type = state.pageData.transactionsType || '';

      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (search) params.set('search', search);
        if (type) params.set('type', type);

        const res = await apiRequest('/transactions?' + params.toString());
        const data = await res.json();

        main.innerHTML = \`
          <div class="page-title">交易记录</div>
          <div class="card">
            <div class="toolbar">
              <input type="text" class="search-input" id="transactionsSearch" placeholder="搜索账号 / 备注" value="\${escapeHtml(search)}">
              <select class="select" id="transactionsType">
                <option value="">全部类型</option>
                <option value="income" \${type === 'income' ? 'selected' : ''}>收入</option>
                <option value="expense" \${type === 'expense' ? 'selected' : ''}>支出</option>
              </select>
              <button class="btn btn-primary" onclick="searchTransactions()">搜索</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>金额</th>
                  <th>类型</th>
                  <th>分类</th>
                  <th>店铺</th>
                  <th>日期</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                \${data.transactions.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280;">暂无数据</td></tr>' : ''}
                \${data.transactions.map(t => \`
                  <tr>
                    <td>\${escapeHtml(t.login_name)}</td>
                    <td style="font-weight:600;color:\${t.type === 'income' ? '#059669' : '#dc2626'}">\${formatMoney(t.amount)}</td>
                    <td>\${t.type === 'income' ? '<span class="badge badge-success">收入</span>' : '<span class="badge badge-danger">支出</span>'}</td>
                    <td>\${escapeHtml(t.category_name || '-')}</td>
                    <td>\${escapeHtml(t.store_name || '-')}</td>
                    <td>\${formatDate(t.transaction_date)}</td>
                    <td>\${escapeHtml(t.description || '-')}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div class="pagination" id="transactionsPagination"></div>
          </div>
        \`;

        renderPagination('transactionsPagination', data.pagination.page, data.pagination.limit, data.pagination.total, renderTransactions);
      } catch (err) {
        main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function searchTransactions() {
      state.pageData.transactionsSearch = document.getElementById('transactionsSearch').value;
      state.pageData.transactionsType = document.getElementById('transactionsType').value;
      renderTransactions(1);
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
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>图标</th>
                  <th>颜色</th>
                  <th>默认</th>
                  <th>使用次数</th>
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
                    <td>\${c.is_default ? '<span class="badge badge-info">是</span>' : '<span class="badge badge-default">否</span>'}</td>
                    <td>\${c.usage_count || 0}</td>
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
