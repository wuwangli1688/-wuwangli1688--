import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminAuthMiddleware, createAdminToken, verifyAdminCredentials } from '../middleware/admin-auth.js';
import { queryAll, queryOne, queryCount, execute, decodeDisplayName, syncAllData } from '../storage/database/direct-connection.js';

/** 根据邮箱域名判断注册来源 */
function getRegisterSource(email: string, dbSource?: string | null): string {
  if (email && email.includes('@wechat.local')) return '微信小程序';
  if (dbSource) return dbSource;
  if (!email) return 'App';
  return 'App';
}

/** ==================== 管理员登录路由（无需鉴权） ==================== */
export const adminLoginRouter = Router();

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 420px;
      padding: 40px 32px;
    }
    h1 {
      text-align: center;
      font-size: 24px;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .subtitle {
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 28px;
    }
    .field { margin-bottom: 18px; }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      font-size: 15px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102,126,234,0.15);
    }
    button {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }
    button:hover { opacity: 0.92; }
    button:active { transform: translateY(1px); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error {
      margin-top: 14px;
      padding: 10px 12px;
      background: #fee2e2;
      color: #991b1b;
      border-radius: 8px;
      font-size: 13px;
      display: none;
    }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <h1>开发者后台</h1>
    <p class="subtitle">请使用管理员账号登录</p>
    <form id="loginForm">
      <div class="field">
        <label for="username">用户名</label>
        <input id="username" name="username" type="text" placeholder="请输入用户名" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">密码</label>
        <input id="password" name="password" type="password" placeholder="请输入密码" autocomplete="current-password" required />
      </div>
      <button type="submit" id="submitBtn">登 录</button>
      <div id="error" class="error"></div>
    </form>
  </div>
  <script>
    (function() {
      var form = document.getElementById('loginForm');
      var errorEl = document.getElementById('error');
      var submitBtn = document.getElementById('submitBtn');
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        errorEl.className = 'error';
        submitBtn.disabled = true;
        submitBtn.textContent = '登录中...';
        var username = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value;
        fetch('login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, password: password })
        })
        .then(function(r) { return r.json().then(function(data) { return { ok: r.ok, data: data }; }); })
        .then(function(result) {
          if (!result.ok) throw new Error(result.data.error || '登录失败');
          localStorage.setItem('admin_token', result.data.token);
          window.location.href = 'dashboard';
        })
        .catch(function(err) {
          errorEl.textContent = err.message || '登录失败，请重试';
          errorEl.className = 'error show';
          submitBtn.disabled = false;
          submitBtn.textContent = '登 录';
        });
      });
    })();
  </script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>开发者后台</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f3f4f6;
      color: #1f2937;
      min-height: 100vh;
    }
    .topbar {
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .topbar h1 { font-size: 18px; font-weight: 700; }
    .topbar-actions { display: flex; gap: 10px; }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #d1d5db;
      background: #fff;
      color: #374151;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover { background: #f9fafb; }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      border: none;
    }
    .btn-primary:hover { opacity: 0.92; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .container { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card {
      background: #fff;
      border-radius: 12px;
      padding: 18px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .stat-label { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #111827; }
    .panel {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      padding: 20px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .panel-title { font-size: 16px; font-weight: 700; }
    .search-box {
      display: flex;
      gap: 8px;
    }
    .search-box input {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 13px;
      min-width: 220px;
    }
    .search-box input:focus { outline: none; border-color: #667eea; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #f3f4f6; }
    th { color: #6b7280; font-weight: 600; background: #f9fafb; }
    tr:hover { background: #f9fafb; }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .tag-parent { background: #dbeafe; color: #1e40af; }
    .tag-child { background: #fce7f3; color: #9d174d; }
    .tag-pro { background: #d1fae5; color: #065f46; }
    .tag-free { background: #f3f4f6; color: #4b5563; }
    .stores { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #6b7280; }
    .empty { text-align: center; padding: 48px; color: #9ca3af; }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 16px; }
    .pagination button { width: auto; padding: 6px 12px; }
    .pagination span { font-size: 13px; color: #6b7280; }
    .children-row { background: #fafafa; }
    .children-cell { padding: 12px 12px 12px 48px; }
    .child-list { margin: 0; padding-left: 16px; color: #4b5563; }
    .child-list li { margin-bottom: 6px; }
    .link { color: #667eea; cursor: pointer; text-decoration: underline; }
    .loading { text-align: center; padding: 40px; color: #6b7280; }
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1f2937;
      color: #fff;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 13px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      display: none;
      z-index: 100;
    }
    .toast.show { display: block; }
    @media (max-width: 768px) {
      .container { padding: 12px; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      table { min-width: 800px; }
      .table-wrap { overflow-x: auto; }
      .topbar { padding: 12px 16px; }
      .search-box input { min-width: 140px; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>开发者后台</h1>
    <div class="topbar-actions">
      <button class="btn btn-primary" id="syncBtn" onclick="syncData()">同步数据</button>
      <button class="btn" onclick="logout()">退出登录</button>
    </div>
  </div>
  <div class="container">
    <div class="stats" id="stats"></div>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">用户列表</div>
        <div class="search-box">
          <input id="searchInput" type="text" placeholder="搜索账号 / 显示名" onkeydown="if(event.key==='Enter')loadUsers(1)" />
          <button class="btn" onclick="loadUsers(1)">搜索</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>登录账号</th>
              <th>显示名</th>
              <th>角色</th>
              <th>店铺</th>
              <th>套餐</th>
              <th>交易数</th>
              <th>注册来源</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="usersTable"></tbody>
        </table>
      </div>
      <div id="loading" class="loading" style="display:none;">加载中...</div>
      <div id="empty" class="empty" style="display:none;">暂无数据</div>
      <div class="pagination" id="pagination"></div>
    </div>
  </div>
  <div id="toast" class="toast"></div>
  <script>
    var API_BASE = '';
    var currentPage = 1;
    var expandedRows = {};

    function getToken() { return localStorage.getItem('admin_token') || ''; }
    function authHeaders() { return { 'x-admin-token': getToken(), 'Content-Type': 'application/json' }; }
    function showToast(msg) {
      var el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast show';
      setTimeout(function() { el.className = 'toast'; }, 2500);
    }
    function api(path, opts) {
      opts = opts || {};
      opts.headers = Object.assign({}, opts.headers || {}, authHeaders());
      return fetch(API_BASE + path, opts).then(function(r) {
        return r.json().then(function(data) {
          if (!r.ok) throw new Error(data.error || '请求失败');
          return data;
        });
      });
    }
    function formatDate(d) {
      if (!d) return '-';
      var date = new Date(d);
      return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
    }
    function loadStats() {
      api('dashboard-data').then(function(data) {
        var html = '';
        var items = [
          { label: '总用户', value: data.totalUsers },
          { label: '主账号', value: data.parentUsers },
          { label: '子账号', value: data.childUsers },
          { label: '活跃用户', value: data.totalActive },
          { label: '今日活跃', value: data.todayActive },
          { label: '本周活跃', value: data.weekActive },
          { label: '总收入', value: '¥' + (data.totalRevenue || 0).toFixed(2) },
          { label: '本月收入', value: '¥' + (data.thisMonthRevenue || 0).toFixed(2) },
          { label: '订单数', value: data.totalOrders },
          { label: '已付款', value: data.paidOrders },
          { label: 'Pro用户', value: data.proCount },
          { label: '反馈数', value: data.feedbackCount }
        ];
        items.forEach(function(item) {
          html += '<div class="stat-card"><div class="stat-label">' + item.label + '</div><div class="stat-value">' + item.value + '</div></div>';
        });
        document.getElementById('stats').innerHTML = html;
      }).catch(function(err) {
        console.error(err);
        if (err.message && err.message.indexOf('登录') > -1) logout();
      });
    }
    function renderUsers(data) {
      var tbody = document.getElementById('usersTable');
      var empty = document.getElementById('empty');
      var pagination = document.getElementById('pagination');
      if (!data.users || data.users.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        pagination.innerHTML = '';
        return;
      }
      empty.style.display = 'none';
      var html = '';
      data.users.forEach(function(u) {
        var roleClass = u.role === 'parent' ? 'tag-parent' : 'tag-child';
        var roleText = u.role === 'parent' ? '主账号' : '子账号';
        var plan = (u.subscription && u.subscription.plan_type) || 'free';
        var planClass = plan === 'pro' ? 'tag-pro' : 'tag-free';
        var planText = plan === 'pro' ? 'Pro' : 'Free';
        var stores = u.storeNames || '-';
        html += '<tr>';
        html += '<td>' + (u.login_name || '-') + '</td>';
        html += '<td>' + (u.display_name || '-') + '</td>';
        html += '<td><span class="tag ' + roleClass + '">' + roleText + '</span></td>';
        html += '<td class="stores" title="' + stores.replace(/"/g, '&quot;') + '">' + stores + '</td>';
        html += '<td><span class="tag ' + planClass + '">' + planText + '</span></td>';
        html += '<td>' + (u.txCount || 0) + '</td>';
        html += '<td>' + (u.register_source || '-') + '</td>';
        html += '<td>' + formatDate(u.created_at) + '</td>';
        html += '<td>';
        if (u.role === 'parent' && u.children && u.children.length > 0) {
          html += '<span class="link" onclick="toggleChildren(\'' + u.id + '\')">' + (expandedRows[u.id] ? '收起子账号' : '查看子账号(' + u.children.length + ')') + '</span>';
        } else {
          html += '-';
        }
        html += '</td>';
        html += '</tr>';
        if (u.role === 'parent' && u.children && u.children.length > 0) {
          var show = expandedRows[u.id] ? 'table-row' : 'none';
          html += '<tr class="children-row" id="child-row-' + u.id + '" style="display:' + show + ';">';
          html += '<td colspan="9" class="children-cell">';
          html += '<ul class="child-list">';
          u.children.forEach(function(c) {
            html += '<li><strong>' + (c.login_name || '-') + '</strong> · ' + (c.display_name || '-') + ' · ' + formatDate(c.created_at) + '</li>';
          });
          html += '</ul></td></tr>';
        }
      });
      tbody.innerHTML = html;

      var phtml = '';
      if (data.totalPages > 1) {
        phtml += '<button class="btn" onclick="loadUsers(' + (currentPage - 1) + ')" ' + (currentPage <= 1 ? 'disabled' : '') + '>上一页</button>';
        phtml += '<span>第 ' + currentPage + ' / ' + data.totalPages + ' 页，共 ' + data.total + ' 条</span>';
        phtml += '<button class="btn" onclick="loadUsers(' + (currentPage + 1) + ')" ' + (currentPage >= data.totalPages ? 'disabled' : '') + '>下一页</button>';
      } else if (data.total > 0) {
        phtml += '<span>共 ' + data.total + ' 条</span>';
      }
      pagination.innerHTML = phtml;
    }
    function loadUsers(page) {
      currentPage = page || 1;
      var search = document.getElementById('searchInput').value.trim();
      document.getElementById('loading').style.display = 'block';
      document.getElementById('usersTable').innerHTML = '';
      document.getElementById('empty').style.display = 'none';
      document.getElementById('pagination').innerHTML = '';
      var url = 'users?page=' + currentPage + '&limit=20';
      if (search) url += '&search=' + encodeURIComponent(search);
      api(url).then(function(data) {
        document.getElementById('loading').style.display = 'none';
        renderUsers(data);
      }).catch(function(err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('empty').style.display = 'block';
        document.getElementById('empty').textContent = err.message || '加载失败';
        if (err.message && err.message.indexOf('登录') > -1) logout();
      });
    }
    function toggleChildren(id) {
      expandedRows[id] = !expandedRows[id];
      loadUsers(currentPage);
    }
    function syncData() {
      var btn = document.getElementById('syncBtn');
      btn.disabled = true;
      btn.textContent = '同步中...';
      api('sync-all', { method: 'POST' }).then(function(data) {
        showToast(data.message || '同步完成');
        loadStats();
        loadUsers(1);
      }).catch(function(err) {
        showToast(err.message || '同步失败');
        if (err.message && err.message.indexOf('登录') > -1) logout();
      }).finally(function() {
        btn.disabled = false;
        btn.textContent = '同步数据';
      });
    }
    function logout() {
      localStorage.removeItem('admin_token');
      window.location.href = 'login';
    }
    if (!getToken()) {
      window.location.href = 'login';
    } else {
      loadStats();
      loadUsers(1);
    }
  </script>
</body>
</html>`;

// 登录页 HTML（无需鉴权）
adminLoginRouter.get('/login', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(LOGIN_HTML);
});

// 仪表盘 HTML（无需鉴权，由前端 JS 自行携带 token 调用数据接口）
adminLoginRouter.get('/dashboard', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(DASHBOARD_HTML);
});

// 登录接口
adminLoginRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: '请输入用户名和密码' });
    return;
  }

  if (!verifyAdminCredentials(username, password)) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }

  const token = createAdminToken();
  res.json({ token, username: 'admin' });
});

/** ==================== 以下路由需要管理员身份验证 ==================== */
const router = Router();
router.use(adminAuthMiddleware);

/** ==================== 仪表盘 ==================== */
router.get('/dashboard-data', async (req: Request, res: Response) => {
  try {
    const totalUsers = await queryCount('SELECT count(*) FROM auth.users');
    const parentUsers = await queryCount("SELECT count(*) FROM auth.users a LEFT JOIN user_profiles u ON a.id = u.id WHERE (u.role IS NULL OR u.role = 'parent')");
    const childUsers = await queryCount("SELECT count(*) FROM user_profiles WHERE role = 'child'");
    const totalActive = await queryCount('SELECT count(DISTINCT user_id) FROM transactions');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActive = await queryCount(
      'SELECT count(DISTINCT user_id) FROM transactions WHERE created_at >= $1',
      [today.toISOString()]
    );

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekActive = await queryCount(
      'SELECT count(DISTINCT user_id) FROM transactions WHERE created_at >= $1',
      [weekAgo.toISOString()]
    );

    const subs = await queryAll('SELECT plan_type FROM subscriptions');
    const proCount = subs.filter((s: any) => s.plan_type === 'pro').length;
    const freeCount = subs.filter((s: any) => s.plan_type === 'free').length;

    const orders = await queryAll('SELECT amount, status, created_at FROM subscription_orders');
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.status === 'paid' ? parseFloat(o.amount) : 0), 0);
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthRevenue = orders
      .filter((o: any) => o.status === 'paid' && o.created_at >= firstDayOfMonth)
      .reduce((sum: number, o: any) => sum + parseFloat(o.amount), 0);

    const totalOrders = orders.length;
    const paidOrders = orders.filter((o: any) => o.status === 'paid').length;
    const feedbackCount = await queryCount('SELECT count(*) FROM feedback');

    res.json({
      totalUsers,
      parentUsers,
      childUsers,
      totalActive,
      todayActive,
      weekActive,
      proCount,
      freeCount,
      totalRevenue,
      thisMonthRevenue,
      totalOrders,
      paidOrders,
      feedbackCount,
    });
  } catch (error) {
    console.error('获取仪表盘数据失败:', error);
    res.status(500).json({ error: '获取仪表盘数据失败' });
  }
});

/** ==================== 用户列表 ==================== */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || '';
    const offset = (page - 1) * limit;

    let countSql = 'SELECT count(*) FROM auth.users';
    let sql = `SELECT a.id,
               COALESCE(u.display_name, SPLIT_PART(a.email, '@', 1), '未知') AS display_name,
               COALESCE(u.role, 'parent') AS role,
               u.parent_user_id,
               COALESCE(u.created_at, a.created_at) AS created_at,
               SPLIT_PART(a.email, '@', 1) AS login_name,
               a.email AS account_email,
               COALESCE(u.platform, 'app') AS platform,
               u.register_source
               FROM auth.users a
               LEFT JOIN user_profiles u ON a.id = u.id`;
    const params: any[] = [];
    const countParams: any[] = [];

    if (search) {
      const whereClause = ` WHERE u.display_name ILIKE $1 OR a.email ILIKE $1 OR SPLIT_PART(a.email, '@', 1) ILIKE $1`;
      sql += whereClause;
      countSql += ` a LEFT JOIN user_profiles u ON a.id = u.id` + whereClause;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    sql += ' ORDER BY a.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const total = await queryCount(countSql, countParams);
    const users = await queryAll(sql, params);

    const userIds = users.map((u: any) => u.id);
    const enrichedUsers = await Promise.all(userIds.map(async (uid: string) => {
      const [subRows, txCount, subAccountCount, storeCount,
      storeNames, tags, lastTxDate] = await Promise.all([
        queryOne('SELECT plan_type, status, expires_at, sub_account_limit, store_limit FROM subscriptions WHERE user_id = $1', [uid]),
        queryCount('SELECT count(*) FROM transactions WHERE user_id = $1', [uid]),
        queryCount('SELECT count(*) FROM user_profiles WHERE parent_user_id = $1', [uid]),
        queryCount('SELECT count(*) FROM stores WHERE owner_id = $1', [uid]),
        queryAll('SELECT name FROM stores WHERE owner_id = $1', [uid]),
        queryAll('SELECT tag FROM user_tags WHERE user_id = $1', [uid]),
        queryOne('SELECT MAX(created_at) as last_active FROM transactions WHERE user_id = $1', [uid]),
      ]);

      const user = users.find((u: any) => u.id === uid);
      return {
        ...user,
        display_name: decodeDisplayName(user.display_name),
        login_name: decodeDisplayName(user.login_name),
        subscription: subRows || { plan_type: 'free', status: 'active' },
        txCount,
        subAccountCount,
        storeCount,
        storeNames: (storeNames || []).map((s: any) => s.name).join(', '),
        activity_index: txCount,
        tags: (tags || []).map((t: any) => t.tag).join(','),
        last_active: lastTxDate?.last_active || null,
        register_source: getRegisterSource(user.account_email, user.register_source),
      };
    }));

    const finalUsers = await Promise.all(enrichedUsers.map(async (u: any) => {
      if (u.role === 'parent') {
        const childProfiles = await queryAll(
          `SELECT u.id, u.display_name, u.created_at, u.register_source,
                  COALESCE(SPLIT_PART(a.email, '@', 1), u.display_name, '未知') AS login_name,
                  a.email AS account_email
           FROM user_profiles u
           LEFT JOIN auth.users a ON u.id = a.id
           WHERE u.parent_user_id = $1`,
          [u.id]
        );

        const childWithSubs = await Promise.all((childProfiles || []).map(async (child: any) => {
          const childSub = await queryOne(
            'SELECT plan_type, status, expires_at FROM subscriptions WHERE user_id = $1',
            [child.id]
          );
          return {
            ...child,
            display_name: decodeDisplayName(child.display_name),
            login_name: decodeDisplayName(child.login_name),
            register_source: getRegisterSource(child.account_email || '', child.register_source),
            subscription: childSub || { plan_type: 'free', status: 'active' }
          };
        }));

        return { ...u, children: childWithSubs };
      }
      return u;
    }));

    res.json({
      users: finalUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

/** ==================== 编辑用户订阅 ==================== */
router.put('/users/:id/subscription', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { plan_type, status } = req.body;

    if (!plan_type || !['free', 'pro'].includes(plan_type)) {
      res.status(400).json({ error: '请选择有效的套餐类型' });
      return;
    }

    const existing = await queryOne('SELECT id FROM subscriptions WHERE user_id = $1', [id]);

    if (existing) {
      const updates: any = { plan_type, updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (plan_type === 'pro') {
        updates.expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      }

      await execute(
        'UPDATE subscriptions SET plan_type = $1, status = $2, expires_at = $3, updated_at = $4 WHERE user_id = $5',
        [updates.plan_type, updates.status || 'active', updates.expires_at || null, updates.updated_at, id]
      );
    } else {
      await execute(
        `INSERT INTO subscriptions (user_id, plan_type, status, sub_account_limit, store_limit, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          plan_type,
          status || 'active',
          plan_type === 'pro' ? 999 : 0,
          plan_type === 'pro' ? 999 : 1,
          plan_type === 'pro' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null,
        ]
      );
    }

    res.json({ success: true, message: '订阅已更新' });
  } catch (error) {
    console.error('更新订阅失败:', error);
    res.status(500).json({ error: '更新订阅失败' });
  }
});

/** ==================== 反馈列表 ==================== */
router.get('/feedbacks', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const total = await queryCount('SELECT count(*) FROM feedback');
    const feedbacks = await queryAll(
      'SELECT id, user_id, content, contact, created_at FROM feedback ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    const userIds = [...new Set(feedbacks.map((f: any) => f.user_id))];
    let profiles: any[] = [];
    if (userIds.length > 0) {
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
      profiles = await queryAll(
        `SELECT a.id, COALESCE(u.display_name, SPLIT_PART(a.email, '@', 1), '未知') AS display_name,
                SPLIT_PART(a.email, '@', 1) AS login_name
         FROM auth.users a
         LEFT JOIN user_profiles u ON a.id = u.id
         WHERE a.id IN (${placeholders})`,
        userIds
      );
    }

    const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
    const enriched = feedbacks.map((f: any) => ({
      ...f,
      user_name: profileMap.get(f.user_id)?.display_name || '未知',
      login_name: profileMap.get(f.user_id)?.login_name || '',
    }));

    res.json({
      feedbacks: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('获取反馈列表失败:', error);
    res.status(500).json({ error: '获取反馈列表失败' });
  }
});

/** ==================== 订单列表 ==================== */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string || '';
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params: any[] = [];
    const countParams: any[] = [];

    if (status) {
      whereClause = ' WHERE status = $1';
      params.push(status);
      countParams.push(status);
    }

    const total = await queryCount(
      `SELECT count(*) FROM subscription_orders${whereClause}`,
      countParams
    );

    const orders = await queryAll(
      `SELECT * FROM subscription_orders${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const userIds = [...new Set(orders.map((o: any) => o.user_id))];
    let profiles: any[] = [];
    if (userIds.length > 0) {
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
      profiles = await queryAll(
        `SELECT a.id, COALESCE(u.display_name, SPLIT_PART(a.email, '@', 1), '未知') AS display_name,
                SPLIT_PART(a.email, '@', 1) AS login_name
         FROM auth.users a
         LEFT JOIN user_profiles u ON a.id = u.id
         WHERE a.id IN (${placeholders})`,
        userIds
      );
    }

    const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
    const enriched = orders.map((o: any) => ({
      ...o,
      user_name: profileMap.get(o.user_id)?.display_name || '未知',
      login_name: profileMap.get(o.user_id)?.login_name || '',
    }));

    res.json({
      orders: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('获取订单列表失败:', error);
    res.status(500).json({ error: '获取订单列表失败' });
  }
});

/** ==================== 确认付款 ==================== */
router.post('/orders/:id/confirm', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const order = await queryOne('SELECT * FROM subscription_orders WHERE id = $1', [id]);

    if (!order) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }

    if (order.status === 'paid') {
      res.json({ success: true, message: '该订单已确认付款' });
      return;
    }

    await execute(
      'UPDATE subscription_orders SET status = $1, paid_at = $2 WHERE id = $3',
      ['paid', new Date().toISOString(), id]
    );

    const existingSub = await queryOne('SELECT id FROM subscriptions WHERE user_id = $1', [order.user_id]);

    if (existingSub) {
      await execute(
        `UPDATE subscriptions SET plan_type = $1, status = $2, expires_at = $3,
         sub_account_limit = $4, store_limit = $5, updated_at = $6
         WHERE user_id = $7`,
        ['pro', 'active', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
         999, 999, new Date().toISOString(), order.user_id]
      );
    } else {
      await execute(
        `INSERT INTO subscriptions (user_id, plan_type, status, sub_account_limit, store_limit, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.user_id, 'pro', 'active', 999, 999,
         new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()]
      );
    }

    res.json({ success: true, message: '付款已确认，订阅已激活' });
  } catch (error) {
    console.error('确认付款失败:', error);
    res.status(500).json({ error: '确认付款失败' });
  }
});

/** ==================== 支付配置 ==================== */
router.get('/payment-config', async (req: Request, res: Response) => {
  try {
    const data = await queryOne('SELECT * FROM payment_config LIMIT 1');
    res.json(data || { alipay_qrcode_url: '', wechat_qrcode_url: '', contact_info: '' });
  } catch (error) {
    console.error('获取支付配置失败:', error);
    res.status(500).json({ error: '获取支付配置失败' });
  }
});

router.put('/payment-config', async (req: Request, res: Response) => {
  try {
    const { alipay_qrcode_url, wechat_qrcode_url, contact_info } = req.body;

    const existing = await queryOne('SELECT id FROM payment_config LIMIT 1');

    if (existing) {
      await execute(
        `UPDATE payment_config SET alipay_qrcode_url = $1, wechat_qrcode_url = $2,
         contact_info = $3, updated_at = $4 WHERE id = $5`,
        [alipay_qrcode_url || '', wechat_qrcode_url || '', contact_info || '', new Date().toISOString(), existing.id]
      );
    } else {
      await execute(
        `INSERT INTO payment_config (alipay_qrcode_url, wechat_qrcode_url, contact_info)
         VALUES ($1, $2, $3)`,
        [alipay_qrcode_url || '', wechat_qrcode_url || '', contact_info || '']
      );
    }

    res.json({ success: true, message: '支付配置已更新' });
  } catch (error) {
    console.error('更新支付配置失败:', error);
    res.status(500).json({ error: '更新支付配置失败' });
  }
});

/** ==================== 搜索用户 ==================== */
router.get('/users/search', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!q) {
      res.json({ users: [], total: 0 });
      return;
    }

    const searchParam = `%${q}%`;
    const total = await queryCount(
      `SELECT count(*) FROM auth.users a
       LEFT JOIN user_profiles u ON a.id = u.id
       WHERE u.display_name ILIKE $1 OR a.email ILIKE $1 OR a.id::text ILIKE $1`,
      [searchParam]
    );

    const users = await queryAll(
      `SELECT a.id, COALESCE(u.display_name, SPLIT_PART(a.email, '@', 1), '未知') AS display_name,
              COALESCE(u.role, 'parent') AS role, u.parent_user_id,
              COALESCE(u.created_at, a.created_at) AS created_at,
              SPLIT_PART(a.email, '@', 1) AS login_name, a.email AS account_email,
              COALESCE(u.platform, 'app') AS platform
       FROM auth.users a
       LEFT JOIN user_profiles u ON a.id = u.id
       WHERE u.display_name ILIKE $1 OR a.email ILIKE $1 OR a.id::text ILIKE $1
       ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
      [searchParam, limit, offset]
    );

    res.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('搜索用户失败:', error);
    res.status(500).json({ error: '搜索用户失败' });
  }
});

// ==========================================
// Display Name History Routes
// ==========================================

router.put('/users/:id/display-name', async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name } = req.body;

    if (!display_name || display_name.trim().length === 0) {
      res.status(400).json({ error: '显示名称不能为空' });
      return;
    }

    const currentQuery = await queryOne('SELECT display_name FROM user_profiles WHERE id = $1', [id]);
    const oldName = currentQuery?.display_name || '';

    await execute('UPDATE user_profiles SET display_name = $1 WHERE id = $2', [display_name.trim(), id]);

    if (currentQuery === null) {
      await execute('INSERT INTO user_profiles (id, display_name, role) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET display_name = $2', [id, display_name.trim(), 'parent']);
    }

    await execute(
      'INSERT INTO display_name_history (user_id, old_name, new_name) VALUES ($1, $2, $3)',
      [id, oldName, display_name.trim()]
    );

    res.json({ success: true, display_name: display_name.trim() });
  } catch (error) {
    console.error('更新显示名称失败:', error);
    res.status(500).json({ error: '更新显示名称失败' });
  }
});

router.get('/users/:id/display-name-history', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await queryAll(
      'SELECT * FROM display_name_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [id]
    );
    res.json({ history });
  } catch (error) {
    console.error('获取显示名称历史失败:', error);
    res.status(500).json({ error: '获取显示名称历史失败' });
  }
});

// ==========================================
// User Tags Routes
// ==========================================

router.get('/users/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const tags = await queryAll('SELECT tag, created_at FROM user_tags WHERE user_id = $1 ORDER BY created_at', [id]);
    res.json({ tags: tags.map(t => t.tag) });
  } catch (error) {
    console.error('获取用户标签失败:', error);
    res.status(500).json({ error: '获取用户标签失败' });
  }
});

router.post('/users/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;

    if (!tag || tag.trim().length === 0) {
      res.status(400).json({ error: '标签不能为空' });
      return;
    }

    await execute(
      'INSERT INTO user_tags (user_id, tag) VALUES ($1, $2) ON CONFLICT (user_id, tag) DO NOTHING',
      [id, tag.trim()]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('添加标签失败:', error);
    res.status(500).json({ error: '添加标签失败' });
  }
});

router.delete('/users/:id/tags/:tag', async (req, res) => {
  try {
    const { id, tag } = req.params;
    await execute('DELETE FROM user_tags WHERE user_id = $1 AND tag = $2', [id, decodeURIComponent(tag)]);
    res.json({ success: true });
  } catch (error) {
    console.error('删除标签失败:', error);
    res.status(500).json({ error: '删除标签失败' });
  }
});

// ==========================================
// Activity Logs Routes
// ==========================================

router.get('/users/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const totalResult = await queryOne('SELECT count(*) as count FROM activity_logs WHERE user_id = $1', [id]);
    const total = parseInt(totalResult?.count || '0');

    const logs = await queryAll(
      'SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [id, parseInt(limit as string), offset]
    );

    const txActivity = await queryAll(
      'SELECT id, created_at, type, amount, note, category_id FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [id]
    );
    const txTotal = await queryOne('SELECT count(*) as count FROM transactions WHERE user_id = $1', [id]);

    const activities = logs.map((l: any) => ({
      created_at: l.created_at,
      action: l.activity_type + (l.description ? ': ' + l.description : ''),
      type: 'log'
    }));

    const txActivities = txActivity.map((t: any) => ({
      created_at: t.created_at,
      action: (t.type === 'income' ? '收入' : '支出') + ' ' + t.amount + '元' + (t.note ? ' (' + t.note + ')' : ''),
      type: 'transaction'
    }));

    const allActivities = [...activities, ...txActivities].sort((a: any, b: any) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json({
      activities: allActivities,
      total: total + parseInt(txTotal?.count || '0'),
      summary: { activity_logs: total, transactions: parseInt(txTotal?.count || '0') }
    });
  } catch (error) {
    console.error('获取活动记录失败:', error);
    res.status(500).json({ error: '获取活动记录失败' });
  }
});

router.post('/activity/seed', async (req, res) => {
  try {
    const { user_id, activity_type = 'login', description = '测试活动' } = req.body;
    await execute(
      'INSERT INTO activity_logs (user_id, activity_type, description) VALUES ($1, $2, $3)',
      [user_id, activity_type, description]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('创建活动记录失败:', error);
    res.status(500).json({ error: '创建活动记录失败' });
  }
});

/** ==================== 用户详情 ==================== */
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await queryOne(
      `SELECT a.id,
              COALESCE(u.display_name, SPLIT_PART(a.email, '@', 1), '未知') AS display_name,
              COALESCE(u.role, 'parent') AS role,
              u.parent_user_id,
              COALESCE(u.created_at, a.created_at) AS created_at,
              COALESCE(u.platform, 'app') AS platform,
              u.register_source,
              SPLIT_PART(a.email, '@', 1) AS login_name, a.email AS account_email
       FROM auth.users a
       LEFT JOIN user_profiles u ON a.id = u.id
       WHERE a.id = $1`,
      [id]
    );

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const subscription = await queryOne(
      'SELECT * FROM subscriptions WHERE user_id = $1',
      [id]
    );

    const txCount = await queryCount('SELECT count(*) FROM transactions WHERE user_id = $1', [id]);
    const storeCount = await queryCount('SELECT count(*) FROM stores WHERE owner_id = $1', [id]);
    const storeNames = (await queryAll('SELECT name FROM stores WHERE owner_id = $1', [id])).map((s: any) => s.name).join(', ');

    const children = await queryAll(
      `SELECT u.id, u.display_name, u.role, u.created_at,
              COALESCE(SPLIT_PART(a.email, '@', 1), u.display_name, '未知') AS login_name,
              a.email AS account_email
       FROM user_profiles u
       LEFT JOIN auth.users a ON u.id = a.id
       WHERE u.parent_user_id = $1`,
      [id]
    );

    const orders = await queryAll(
      'SELECT * FROM subscription_orders WHERE user_id = $1 ORDER BY created_at DESC',
      [id]
    );

    const tags = await queryAll('SELECT tag FROM user_tags WHERE user_id = $1', [id]);
    const lastActive = await queryOne(
      'SELECT MAX(created_at) as last_active FROM transactions WHERE user_id = $1',
      [id]
    );
    const subAccountCount = await queryCount('SELECT count(*) FROM user_profiles WHERE parent_user_id = $1', [id]);

    const enrichedUser = {
      ...user,
      display_name: decodeDisplayName(user.display_name),
      login_name: decodeDisplayName(user.login_name),
      register_source: getRegisterSource(user.account_email, user.register_source),
      subscription: subscription || null,
      txCount,
      storeCount,
      storeNames,
      children: (children || []).map((c: any) => ({
        ...c,
        display_name: decodeDisplayName(c.display_name),
        login_name: decodeDisplayName(c.login_name),
        register_source: getRegisterSource(c.account_email || c.login_name || '', c.register_source),
      })),
      subAccountCount,
      orders,
      activity_index: txCount,
      tags: (tags || []).map((t: any) => t.tag).join(','),
      last_active: lastActive?.last_active || null,
    };

    res.json(enrichedUser);
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({ error: '获取用户详情失败' });
  }
});

// 全量同步端点
router.post('/sync-all', async (req: any, res: any) => {
  try {
    const result = await syncAllData();
    res.json({ success: true, message: '全量数据同步完成', details: result });
  } catch (err: any) {
    console.error('[Admin] 全量同步失败:', err);
    res.status(500).json({ error: '同步失败: ' + (err.message || String(err)) });
  }
});

export default router;
