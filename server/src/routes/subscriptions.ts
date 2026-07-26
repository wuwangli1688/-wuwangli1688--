import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getSupabaseClient } from '../storage/database/supabase-client.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ==================== Subscription Plan Config ====================
const PLANS = {
  free: {
    name: '免费版',
    price: 0,
    store_limit: 1,
    sub_account_limit: 0,
    history_months: 3,      // 仅查看近3个月
    export_enabled: false,
    stores_enabled: true,   // 1个门店
    sub_accounts_enabled: false,
  },
  pro: {
    name: '专业版',
    price: 15,               // ¥15/月
    price_yearly: 144,       // ¥144/年 (8折)
    store_limit: 9999,       // 不限
    sub_account_limit: 9999, // 不限
    history_months: 9999,    // 不限
    export_enabled: true,
    stores_enabled: true,
    sub_accounts_enabled: true,
  },
};

// Helper: get or create subscription for a user
async function getOrCreateSubscription(client: any, userId: string) {
  // Try to get existing subscription
  const { data: existing } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    // Check if expired
    if (existing.status === 'active' && existing.expires_at) {
      const now = new Date();
      const expires = new Date(existing.expires_at);
      if (now > expires) {
        // Expired, revert to free
        await client
          .from('subscriptions')
          .update({
            status: 'expired',
            plan_type: 'free',
            sub_account_limit: 0,
            store_limit: 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        return {
          ...existing,
          status: 'expired',
          plan_type: 'free',
          sub_account_limit: 0,
          store_limit: 1,
        };
      }
    }
    return existing;
  }

  // Create default free subscription
  const { data: newSub, error } = await client
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_type: 'free',
      status: 'active',
      sub_account_limit: 0,
      store_limit: 1,
    })
    .select()
    .single();

  if (error) throw error;
  return newSub;
}

// GET /api/v1/subscriptions/my - Get current user's subscription info
router.get('/my', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = getSupabaseClient();
    const userId = req.userId!;
    const subscription = await getOrCreateSubscription(client, userId);

    // Also count current stores and sub-accounts
    const { count: storeCount } = await client
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId);

    const { count: subAccountCount } = await client
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('parent_user_id', userId)
      .eq('role', 'child');

    const plan = PLANS[subscription.plan_type as keyof typeof PLANS] || PLANS.free;

    res.json({
      data: {
        ...subscription,
        plan_info: plan,
        usage: {
          stores: storeCount || 0,
          store_limit: subscription.store_limit,
          sub_accounts: subAccountCount || 0,
          sub_account_limit: subscription.sub_account_limit,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/subscriptions/plans - Get available plans
router.get('/plans', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ data: PLANS });
});

// GET /api/v1/subscriptions/check-feature - Check if a feature is available
router.get('/check-feature', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { feature } = req.query;
    const client = getSupabaseClient();
    const userId = req.userId!;

    const subscription = await getOrCreateSubscription(client, userId);
    const plan = PLANS[subscription.plan_type as keyof typeof PLANS] || PLANS.free;

    let available = false;
    let message = '';

    switch (feature) {
      case 'export':
        available = plan.export_enabled;
        message = available ? '' : '数据导出功能仅限专业版使用，请升级套餐';
        break;
      case 'sub_accounts':
        available = plan.sub_accounts_enabled;
        message = available ? '' : '子账号功能仅限专业版使用，请升级套餐';
        break;
      case 'stores':
        available = plan.stores_enabled;
        message = available ? '' : '门店管理功能仅限专业版使用';
        break;
      case 'create_store': {
        const { count: storeCount } = await client
          .from('stores')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', userId);
        const currentCount = storeCount || 0;
        available = currentCount < subscription.store_limit;
        message = available ? '' : `免费版最多创建 ${subscription.store_limit} 个门店，请升级专业版`;
        break;
      }
      case 'create_sub_account': {
        const { count: subCount } = await client
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('parent_user_id', userId)
          .eq('role', 'child');
        const currentCount = subCount || 0;
        available = currentCount < subscription.sub_account_limit;
        message = available ? '' : `子账号数量已达上限（${subscription.sub_account_limit}个），请升级专业版`;
        break;
      }
      case 'history_unlimited':
        available = plan.history_months >= 9999;
        message = available ? '' : '免费版仅可查看近3个月的数据，请升级专业版查看更多';
        break;
      default:
        available = false;
        message = '未知功能';
    }

    res.json({ data: { feature, available, message } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /api/v1/subscriptions/create-order - Create a payment order (manual)
router.post('/create-order', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan_type, period } = req.body; // plan_type: 'pro', period: 'monthly' | 'yearly'
    const userId = req.userId!;

    if (plan_type !== 'pro') {
      return res.status(400).json({ error: '仅支持升级到专业版' });
    }
    if (!['monthly', 'yearly'].includes(period)) {
      return res.status(400).json({ error: 'period 必须是 monthly 或 yearly' });
    }

    const price = period === 'monthly' ? PLANS.pro.price : PLANS.pro.price_yearly;
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Save order to database
    const client = getSupabaseClient();
    const { data: order, error } = await client
      .from('subscription_orders')
      .insert({
        order_id: orderId,
        user_id: userId,
        plan_type,
        period,
        amount: price,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      data: {
        order,
        payment_info: {
          method: 'manual',
          message: '请使用支付宝或微信扫码支付，支付后联系管理员确认开通',
          amount: price,
          note: `即时记账-${period === 'monthly' ? '月付' : '年付'}-专业版`,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /api/v1/subscriptions/activate - Activate a subscription (admin only or after payment)
router.post('/activate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { order_id } = req.body;
    const client = getSupabaseClient();

    // Find the order
    const { data: order, error: findError } = await client
      .from('subscription_orders')
      .select('*')
      .eq('order_id', order_id)
      .single();

    if (findError || !order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: '订单已处理' });
    }

    // Update order status
    const now = new Date().toISOString();
    await client
      .from('subscription_orders')
      .update({
        status: 'paid',
        paid_at: now,
        activated_at: now,
      })
      .eq('order_id', order_id);

    // Calculate expiration
    const expiresAt = new Date();
    if (order.period === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Check if user already has a subscription
    const { data: existingSub } = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', order.user_id)
      .maybeSingle();

    if (existingSub) {
      // Update existing subscription
      await client
        .from('subscriptions')
        .update({
          plan_type: 'pro',
          status: 'active',
          sub_account_limit: 9999,
          store_limit: 9999,
          started_at: now,
          expires_at: expiresAt.toISOString(),
          updated_at: now,
        })
        .eq('id', existingSub.id);
    } else {
      // Create new subscription
      await client
        .from('subscriptions')
        .insert({
          user_id: order.user_id,
          plan_type: 'pro',
          status: 'active',
          sub_account_limit: 9999,
          store_limit: 9999,
          started_at: now,
          expires_at: expiresAt.toISOString(),
        });
    }

    res.json({ data: { success: true, message: '套餐已激活' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;