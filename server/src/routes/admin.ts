import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminAuthMiddleware, createAdminToken, verifyAdminCredentials } from '../middleware/admin-auth.js';
import { queryAll, queryOne, queryCount, execute, decodeDisplayName, syncAllData } from '../storage/database/direct-connection.js';

const router = Router();

/** 根据邮箱域名判断注册来源 */
function getRegisterSource(email: string, dbSource?: string | null): string {
  // 微信小程序用户优先从 email 判断（不受数据库默认值影响）
  if (email && email.includes('@wechat.local')) return '微信小程序';
  // 再使用数据库存储的注册来源
  if (dbSource) return dbSource;
  // 最后 fallback
  if (!email) return 'App';
  return 'App';
}

/** 所有路由都需要管理员身份验证 */
router.use(adminAuthMiddleware);

/** ==================== 管理员登录（无需中间件，单独注册） ==================== */
export const adminLoginRouter = Router();

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

/** ==================== 仪表盘 ==================== */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // 总用户数（auth.users 包含所有用户）
    const totalUsers = await queryCount('SELECT count(*) FROM auth.users');

    // 主账号数（user_profiles 中 role=parent 或 没有 user_profiles 记录的用户默认为主账号）
    const parentUsers = await queryCount("SELECT count(*) FROM auth.users a LEFT JOIN user_profiles u ON a.id = u.id WHERE (u.role IS NULL OR u.role = 'parent')");

    // 子账号数
    const childUsers = await queryCount("SELECT count(*) FROM user_profiles WHERE role = 'child'");

    // 总活跃用户（历史有交易记录的用户数）
    const totalActive = await queryCount(
      'SELECT count(DISTINCT user_id) FROM transactions'
    );

    // 今日活跃用户
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActive = await queryCount(
      'SELECT count(DISTINCT user_id) FROM transactions WHERE created_at >= $1',
      [today.toISOString()]
    );

    // 本周活跃
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekActive = await queryCount(
      'SELECT count(DISTINCT user_id) FROM transactions WHERE created_at >= $1',
      [weekAgo.toISOString()]
    );

    // 订阅统计
    const subs = await queryAll('SELECT plan_type FROM subscriptions');
    const proCount = subs.filter((s: any) => s.plan_type === 'pro').length;
    const freeCount = subs.filter((s: any) => s.plan_type === 'free').length;

    // 订单统计
    const orders = await queryAll('SELECT amount, status, created_at FROM subscription_orders');
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.status === 'paid' ? parseFloat(o.amount) : 0), 0);
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthRevenue = orders
      .filter((o: any) => o.status === 'paid' && o.created_at >= firstDayOfMonth)
      .reduce((sum: number, o: any) => sum + parseFloat(o.amount), 0);

    const totalOrders = orders.length;
    const paidOrders = orders.filter((o: any) => o.status === 'paid').length;

    // 反馈数
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

    // 使用 auth.users 作为主表（所有用户都有记录），LEFT JOIN user_profiles（部分用户可能没有）
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

    // 获取每个用户的订阅、交易数、子账号数、门店数、活跃指数、标签、最近活跃时间
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

    // 计算每个用户的子账号详情
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

    // 获取反馈用户的用户名（使用 auth.users 作为主表，兼容没有 user_profiles 的用户）
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

    // 获取用户信息
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

    // 更新订单状态
    await execute(
      'UPDATE subscription_orders SET status = $1, paid_at = $2 WHERE id = $3',
      ['paid', new Date().toISOString(), id]
    );

    // 激活订阅
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

/**
 * PUT /api/v1/admin/users/:id/display-name
 * Update user display name and record history
 * Body: { display_name: string }
 */
router.put('/users/:id/display-name', async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name } = req.body;
    
    if (!display_name || display_name.trim().length === 0) {
      return res.status(400).json({ error: '显示名称不能为空' });
    }
    
    // Get current display name
    const currentQuery = await queryOne('SELECT display_name FROM user_profiles WHERE id = $1', [id]);
    const oldName = currentQuery?.display_name || '';
    
    // Update display name
    await execute('UPDATE user_profiles SET display_name = $1 WHERE id = $2', [display_name.trim(), id]);
    
    // If no row was updated, insert into user_profiles
    if (currentQuery === null) {
      await execute('INSERT INTO user_profiles (id, display_name, role) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET display_name = $2', [id, display_name.trim(), 'parent']);
    }
    
    // Record history
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

/**
 * GET /api/v1/admin/users/:id/display-name-history
 * Get display name change history for a user
 */
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

/**
 * GET /api/v1/admin/users/:id/tags
 * Get tags for a user
 */
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

/**
 * POST /api/v1/admin/users/:id/tags
 * Add a tag to a user
 * Body: { tag: string }
 */
router.post('/users/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;
    
    if (!tag || tag.trim().length === 0) {
      return res.status(400).json({ error: '标签不能为空' });
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

/**
 * DELETE /api/v1/admin/users/:id/tags/:tag
 * Remove a tag from a user
 */
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

/**
 * GET /api/v1/admin/users/:id/activity
 * Get activity logs + transaction history for a user
 */
router.get('/users/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Get activity logs
    const totalResult = await queryOne('SELECT count(*) as count FROM activity_logs WHERE user_id = $1', [id]);
    const total = parseInt(totalResult?.count || '0');
    
    const logs = await queryAll(
      'SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [id, parseInt(limit as string), offset]
    );
    
    // Also get transaction history as activity records
    const txActivity = await queryAll(
      'SELECT id, created_at, type, amount, note, category_id FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [id]
    );
    const txTotal = await queryOne('SELECT count(*) as count FROM transactions WHERE user_id = $1', [id]);
    
    // Combine into activity records
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
    
    // Merge and sort by created_at desc
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

/**
 * POST /api/v1/admin/activity/seed
 * Seed test activity data for demo purposes
 */
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

    // 获取订阅信息
    const subscription = await queryOne(
      'SELECT * FROM subscriptions WHERE user_id = $1',
      [id]
    );

    // 获取交易统计
    const txCount = await queryCount('SELECT count(*) FROM transactions WHERE user_id = $1', [id]);

    // 获取门店数据
    const storeCount = await queryCount('SELECT count(*) FROM stores WHERE owner_id = $1', [id]);
    const storeNames = (await queryAll('SELECT name FROM stores WHERE owner_id = $1', [id])).map((s: any) => s.name).join(', ');

    // 获取子账号
    const children = await queryAll(
      `SELECT u.id, u.display_name, u.role, u.created_at,
              COALESCE(SPLIT_PART(a.email, '@', 1), u.display_name, '未知') AS login_name
       FROM user_profiles u
       LEFT JOIN auth.users a ON u.id = a.id
       WHERE u.parent_user_id = $1`,
      [id]
    );

    // 获取订单
    const orders = await queryAll(
      'SELECT * FROM subscription_orders WHERE user_id = $1 ORDER BY created_at DESC',
      [id]
    );

    // 获取活跃指数、标签、最近活跃时间
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

// 全量同步端点 - 同步所有用户数据、活动日志和交易记录
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