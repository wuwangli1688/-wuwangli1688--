import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSupabaseClient, getSupabaseCredentials } from '../storage/database/supabase-client.js';
import { adminAuthMiddleware, createAdminToken, verifyAdminCredentials } from '../middleware/admin-auth.js';

const router = Router();

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
    const client = getSupabaseClient();

    // 总用户数
    const { count: totalUsers } = await client
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    // 主账号数
    const { count: parentUsers } = await client
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'parent');

    // 子账号数
    const { count: childUsers } = await client
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'child');

    // 活跃用户（今日有交易）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayActive } = await client
      .from('transactions')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    // 本周活跃
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: weekActive } = await client
      .from('transactions')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString());

    // 订阅统计
    const { data: subs } = await client
      .from('subscriptions')
      .select('plan_type');

    const proCount = subs?.filter(s => s.plan_type === 'pro').length || 0;
    const freeCount = subs?.filter(s => s.plan_type === 'free').length || 0;

    // 订单统计
    const { data: orders } = await client
      .from('subscription_orders')
      .select('amount, status');

    const totalRevenue = orders?.reduce((sum, o) => sum + (o.status === 'paid' ? o.amount : 0), 0) || 0;
    const thisMonthRevenue = orders?.filter(o => {
      if (o.status !== 'paid') return false;
      return true; // simplified
    }).reduce((sum, o) => sum + o.amount, 0) || 0;

    const totalOrders = orders?.length || 0;
    const paidOrders = orders?.filter(o => o.status === 'paid').length || 0;

    // 反馈数
    const { count: feedbackCount } = await client
      .from('feedback')
      .select('*', { count: 'exact', head: true });

    res.json({
      totalUsers: totalUsers || 0,
      parentUsers: parentUsers || 0,
      childUsers: childUsers || 0,
      todayActive: todayActive || 0,
      weekActive: weekActive || 0,
      proCount,
      freeCount,
      totalRevenue,
      thisMonthRevenue,
      totalOrders,
      paidOrders,
      feedbackCount: feedbackCount || 0,
    });
  } catch (error) {
    console.error('获取仪表盘数据失败:', error);
    res.status(500).json({ error: '获取仪表盘数据失败' });
  }
});

/** ==================== 用户列表 ==================== */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || '';
    const offset = (page - 1) * limit;

    let query = client
      .from('user_profiles')
      .select('id, display_name, role, parent_user_id, created_at', { count: 'exact' });

    if (search) {
      query = query.or(`display_name.ilike.%${search}%`);
    }

    const { data: users, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // 获取每个用户的订阅、交易数、子账号数、门店数
    const userIds = users?.map(u => u.id) || [];
    const enrichedUsers = await Promise.all(userIds.map(async (uid) => {
      const [subResult, txCountResult, subAccountsResult, storesResult, weekTxResult] = await Promise.all([
        client.from('subscriptions').select('plan_type, status, expires_at, sub_account_limit, store_limit').eq('user_id', uid).maybeSingle(),
        client.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        client.from('user_profiles').select('id', { count: 'exact', head: true }).eq('parent_user_id', uid),
        client.from('stores').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        client.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const user = users?.find(u => u.id === uid);
      return {
        ...user,
        subscription: subResult.data || { plan_type: 'free', status: 'active' },
        txCount: txCountResult.count || 0,
        weekTxCount: weekTxResult.count || 0,
        subAccountCount: subAccountsResult.count || 0,
        storeCount: storesResult.count || 0,
      };
    }));

    // 计算每个用户的子账号详情
    const finalUsers = await Promise.all(enrichedUsers.map(async (u) => {
      if (u.role === 'parent') {
        const { data: childProfiles } = await client
          .from('user_profiles')
          .select('id, display_name, created_at')
          .eq('parent_user_id', u.id);

        const childWithSubs = await Promise.all((childProfiles || []).map(async (child) => {
          const { data: childSub } = await client
            .from('subscriptions')
            .select('plan_type, status, expires_at')
            .eq('user_id', child.id)
            .maybeSingle();
          return { ...child, subscription: childSub || { plan_type: 'free', status: 'active' } };
        }));

        return { ...u, children: childWithSubs };
      }
      return u;
    }));

    res.json({
      users: finalUsers,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
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
    const client = getSupabaseClient();

    if (!plan_type || !['free', 'pro'].includes(plan_type)) {
      res.status(400).json({ error: '请选择有效的套餐类型' });
      return;
    }

    const { data: existing } = await client
      .from('subscriptions')
      .select('id')
      .eq('user_id', id)
      .maybeSingle();

    if (existing) {
      const updates: any = { plan_type, updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (plan_type === 'pro') {
        updates.expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      }

      await client.from('subscriptions').update(updates).eq('user_id', id);
    } else {
      await client.from('subscriptions').insert({
        user_id: id,
        plan_type,
        status: status || 'active',
        sub_account_limit: plan_type === 'pro' ? 999 : 0,
        store_limit: plan_type === 'pro' ? 999 : 1,
        expires_at: plan_type === 'pro' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null,
      });
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
    const client = getSupabaseClient();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { data: feedbacks, count } = await client
      .from('feedback')
      .select('id, user_id, email, content, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 获取反馈用户的用户名
    const userIds = [...new Set(feedbacks?.map(f => f.user_id) || [])];
    const { data: profiles } = await client
      .from('user_profiles')
      .select('id, email, username')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    const enriched = feedbacks?.map(f => ({
      ...f,
      user_name: profileMap.get(f.user_id)?.username || profileMap.get(f.user_id)?.email || '未知',
    })) || [];

    res.json({
      feedbacks: enriched,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('获取反馈列表失败:', error);
    res.status(500).json({ error: '获取反馈列表失败' });
  }
});

/** ==================== 订单列表 ==================== */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string || '';
    const offset = (page - 1) * limit;

    let query = client
      .from('subscription_orders')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 获取用户信息
    const userIds = [...new Set(orders?.map(o => o.user_id) || [])];
    const { data: profiles } = await client
      .from('user_profiles')
      .select('id, email, username')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    const enriched = orders?.map(o => ({
      ...o,
      user_name: profileMap.get(o.user_id)?.username || profileMap.get(o.user_id)?.email || '未知',
    })) || [];

    res.json({
      orders: enriched,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
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
    const client = getSupabaseClient();

    const { data: order } = await client
      .from('subscription_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (!order) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }

    if (order.status === 'paid') {
      res.json({ success: true, message: '该订单已确认付款' });
      return;
    }

    // 更新订单状态
    await client
      .from('subscription_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id);

    // 激活订阅
    const { data: existingSub } = await client
      .from('subscriptions')
      .select('id')
      .eq('user_id', order.user_id)
      .maybeSingle();

    if (existingSub) {
      await client
        .from('subscriptions')
        .update({
          plan_type: 'pro',
          status: 'active',
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          sub_account_limit: 999,
          store_limit: 999,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', order.user_id);
    } else {
      await client
        .from('subscriptions')
        .insert({
          user_id: order.user_id,
          plan_type: 'pro',
          status: 'active',
          sub_account_limit: 999,
          store_limit: 999,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
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
    const client = getSupabaseClient();
    const { data } = await client
      .from('payment_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    res.json(data || { alipay_qrcode_url: '', wechat_qrcode_url: '', contact_info: '' });
  } catch (error) {
    console.error('获取支付配置失败:', error);
    res.status(500).json({ error: '获取支付配置失败' });
  }
});

router.put('/payment-config', async (req: Request, res: Response) => {
  try {
    const { alipay_qrcode_url, wechat_qrcode_url, contact_info } = req.body;
    const client = getSupabaseClient();

    const { data: existing } = await client
      .from('payment_config')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      await client
        .from('payment_config')
        .update({
          alipay_qrcode_url: alipay_qrcode_url || '',
          wechat_qrcode_url: wechat_qrcode_url || '',
          contact_info: contact_info || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await client
        .from('payment_config')
        .insert({
          alipay_qrcode_url: alipay_qrcode_url || '',
          wechat_qrcode_url: wechat_qrcode_url || '',
          contact_info: contact_info || '',
        });
    }

    res.json({ success: true, message: '支付配置已更新' });
  } catch (error) {
    console.error('更新支付配置失败:', error);
    res.status(500).json({ error: '更新支付配置失败' });
  }
});

export default router;