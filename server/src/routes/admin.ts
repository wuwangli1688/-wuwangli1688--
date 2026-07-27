import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client.js';

const router = Router();

/** 管理员权限中间件：仅主账号可访问 */
async function requireAdmin(req: Request, res: Response, next: any) {
  try {
    const userId = (req as any).userId;
    if (!userId) { res.status(401).json({ error: '请先登录' }); return; }

    const client = getSupabaseClient();
    const { data: profile } = await client
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!profile || profile.role !== 'parent') {
      res.status(403).json({ error: '无管理员权限' });
      return;
    }
    next();
  } catch (e) {
    res.status(500).json({ error: '权限验证失败' });
  }
}

router.use(requireAdmin);

// ============================================================
// 1. 仪表盘总览统计
// ============================================================
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();

    // 总用户数
    const { count: totalUsers } = await client
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    // 主账号数（付费用户）
    const { count: parentUsers } = await client
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'parent');

    // 子账号数
    const { count: childUsers } = await client
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'child');

    // 专业版订阅数
    const { count: proSubscriptions } = await client
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('plan_type', 'pro')
      .eq('status', 'active');

    // 总订单数
    const { count: totalOrders } = await client
      .from('subscription_orders')
      .select('*', { count: 'exact', head: true });

    // 已完成付款订单数
    const { count: paidOrders } = await client
      .from('subscription_orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paid');

    // 总收入
    const { data: revenueData } = await client
      .from('subscription_orders')
      .select('amount')
      .eq('status', 'paid');

    const totalRevenue = (revenueData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // 本月收入
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { data: monthRevenueData } = await client
      .from('subscription_orders')
      .select('amount')
      .eq('status', 'paid')
      .gte('paid_at', startOfMonth.toISOString());

    const monthRevenue = (monthRevenueData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // 反馈总数
    const { count: totalFeedbacks } = await client
      .from('user_feedback')
      .select('*', { count: 'exact', head: true });

    // 今日活跃用户（有交易记录）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayTransactions } = await client
      .from('transactions')
      .select('user_id')
      .gte('created_at', today.toISOString());

    const activeToday = new Set((todayTransactions || []).map((t: any) => t.user_id)).size;

    // 近7天活跃用户
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    const { data: weekTransactions } = await client
      .from('transactions')
      .select('user_id')
      .gte('created_at', weekAgo.toISOString());

    const activeWeek = new Set((weekTransactions || []).map((t: any) => t.user_id)).size;

    res.json({
      totalUsers: totalUsers || 0,
      parentUsers: parentUsers || 0,
      childUsers: childUsers || 0,
      proSubscriptions: proSubscriptions || 0,
      totalOrders: totalOrders || 0,
      paidOrders: paidOrders || 0,
      totalRevenue: totalRevenue || 0,
      monthRevenue: monthRevenue || 0,
      totalFeedbacks: totalFeedbacks || 0,
      activeToday,
      activeWeek,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 2. 用户列表（含使用频率统计）
// ============================================================
router.get('/users', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string || '';

    let query = client
      .from('user_profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,id.ilike.%${search}%`);
    }

    const { data: users, count, error } = await query;
    if (error) throw error;

    // 获取每个用户的订阅信息、交易总数、最近使用时间
    const userIds = (users || []).map((u: any) => u.id);
    const enrichedUsers = [];

    for (const user of (users || [])) {
      // 订阅信息
      const { data: sub } = await client
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // 交易总数
      const { count: txCount } = await client
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // 最近交易时间
      const { data: lastTx } = await client
        .from('transactions')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      // 最近7天交易数
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      const { count: weekTxCount } = await client
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', weekAgo.toISOString());

      // 门店数
      const { count: storeCount } = await client
        .from('stores')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id);

      // 子账号数
      const { count: childCount } = await client
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('parent_user_id', user.id);

      enrichedUsers.push({
        id: user.id,
        displayName: user.display_name,
        role: user.role,
        roleTitle: user.role_title,
        platform: user.platform,
        createdAt: user.created_at,
        subscription: sub ? {
          planType: sub.plan_type,
          status: sub.status,
          expiresAt: sub.expires_at,
          storeLimit: sub.store_limit,
          subAccountLimit: sub.sub_account_limit,
        } : null,
        stats: {
          totalTransactions: txCount || 0,
          weekTransactions: weekTxCount || 0,
          storeCount: storeCount || 0,
          childCount: childCount || 0,
          lastActive: lastTx?.[0]?.created_at || null,
        },
      });
    }

    res.json({
      users: enrichedUsers,
      total: count || 0,
      page,
      limit,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 3. 管理用户订阅
// ============================================================
router.put('/users/:userId/subscription', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const { userId } = req.params;
    const { planType, status, storeLimit, subAccountLimit, expiresAt } = req.body;

    // 检查用户是否存在
    const { data: user } = await client
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    // 检查是否有已有订阅
    const { data: existingSub } = await client
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existingSub) {
      // 更新
      const updateData: any = {};
      if (planType) updateData.plan_type = planType;
      if (status) updateData.status = status;
      if (storeLimit !== undefined) updateData.store_limit = storeLimit;
      if (subAccountLimit !== undefined) updateData.sub_account_limit = subAccountLimit;
      if (expiresAt) updateData.expires_at = expiresAt;
      updateData.updated_at = new Date().toISOString();

      await client
        .from('subscriptions')
        .update(updateData)
        .eq('user_id', userId);
    } else {
      // 创建
      await client
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_type: planType || 'free',
          status: status || 'active',
          store_limit: storeLimit ?? 1,
          sub_account_limit: subAccountLimit ?? 0,
          started_at: new Date().toISOString(),
          expires_at: expiresAt || null,
        });
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 4. 反馈列表
// ============================================================
router.get('/feedbacks', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { data: feedbacks, count, error } = await client
      .from('user_feedback')
      .select('*, user_profiles!inner(display_name, role)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const list = (feedbacks || []).map((f: any) => ({
      id: f.id,
      userId: f.user_id,
      userName: f.user_profiles?.display_name || '未知用户',
      content: f.content,
      contact: f.contact,
      createdAt: f.created_at,
    }));

    res.json({ feedbacks: list, total: count || 0, page, limit });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 5. 订单/付款记录
// ============================================================
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string || '';

    let query = client
      .from('subscription_orders')
      .select('*, user_profiles!inner(display_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: orders, count, error } = await query;
    if (error) throw error;

    const list = (orders || []).map((o: any) => ({
      id: o.id,
      orderId: o.order_id,
      userId: o.user_id,
      userName: o.user_profiles?.display_name || '未知用户',
      planType: o.plan_type,
      period: o.period,
      amount: o.amount,
      status: o.status,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      activatedAt: o.activated_at,
    }));

    res.json({ orders: list, total: count || 0, page, limit });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 6. 手动确认付款
// ============================================================
router.post('/orders/:orderId/confirm', async (req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const { orderId } = req.params;

    const { data: order } = await client
      .from('subscription_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }

    if (order.status === 'paid') {
      res.json({ error: '该订单已付款' });
      return;
    }

    const now = new Date().toISOString();
    const expiresAt = new Date();
    if (order.period === 'year') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // 更新订单状态
    await client
      .from('subscription_orders')
      .update({
        status: 'paid',
        paid_at: now,
        activated_at: now,
      })
      .eq('id', orderId);

    // 激活订阅
    const { data: existingSub } = await client
      .from('subscriptions')
      .select('id')
      .eq('user_id', order.user_id)
      .single();

    if (existingSub) {
      await client
        .from('subscriptions')
        .update({
          plan_type: 'pro',
          status: 'active',
          sub_account_limit: 999,
          store_limit: 999,
          started_at: now,
          expires_at: expiresAt.toISOString(),
          updated_at: now,
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
          started_at: now,
          expires_at: expiresAt.toISOString(),
        });
    }

    res.json({ success: true, message: '付款已确认，订阅已激活' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;