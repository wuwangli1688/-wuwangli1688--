import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware, requireParent } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getSupabaseClient } from '../storage/database/supabase-client.js';
import { categories, transactions, userProfiles } from '../storage/database/shared/schema.js';
import { eq, and, desc, gte, lte, inArray, isNull, or, sql } from 'drizzle-orm';

const router = Router();

// ============ Password Reset (no auth required) ============
// POST /api/v1/accounts/reset-password-request - Send reset code
router.post('/reset-password-request', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: '请提供邮箱地址' });
    }

    const adminClient = getSupabaseClient();

    // Check if user exists (try both raw email and @记账app.local format)
    const { data: users } = await adminClient.auth.admin.listUsers();
    const foundUser = users.users.find((u: { email?: string }) =>
      u.email?.toLowerCase() === email.toLowerCase() ||
      u.email?.toLowerCase() === `${email}@记账app.local`.toLowerCase()
    );

    if (!foundUser) {
      // Don't reveal whether the email exists
      return res.json({ message: '如果该邮箱已注册，重置密码链接已发送' });
    }

    const targetEmail = foundUser.email!;

    const { error } = await adminClient.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:5000',
    });

    if (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({ error: '发送重置链接失败: ' + error.message });
    }

    return res.json({ message: '重置密码链接已发送到您的邮箱' });
  } catch (error) {
    console.error('Reset password request error:', error);
    return res.status(500).json({ error: '请求失败' });
  }
});

// POST /api/v1/accounts/reset-password - Reset password with code
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: '请提供邮箱、验证码和新密码' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: '密码长度至少8位' });
    }

    const adminClient = getSupabaseClient();

    // Find user by email
    const { data: users } = await adminClient.auth.admin.listUsers();
    const foundUser = users.users.find((u: { email?: string }) =>
      u.email?.toLowerCase() === email.toLowerCase() ||
      u.email?.toLowerCase() === `${email}@记账app.local`.toLowerCase()
    );

    if (!foundUser) {
      return res.status(400).json({ error: '该账号未注册' });
    }

    // Verify OTP code
    const { data: verifyData, error: verifyError } = await adminClient.auth.verifyOtp({
      email: foundUser.email!,
      token: code,
      type: 'recovery',
    });

    if (verifyError || !verifyData.session) {
      return res.status(400).json({ error: '验证码无效或已过期' });
    }

    // Update password using the verified session
    const userClient = getSupabaseClient(verifyData.session.access_token);
    const { error: updateError } = await userClient.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return res.status(500).json({ error: '密码重置失败: ' + updateError.message });
    }

    return res.json({ message: '密码重置成功，请使用新密码登录' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: '重置失败' });
  }
});

// All routes below require authentication
router.use(authMiddleware);

// ============ Password Change ============
// POST /api/v1/accounts/change-password
router.post('/change-password', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请提供旧密码和新密码' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: '新密码长度至少8位' });
    }

    const token = req.headers['x-session'] as string;
    const client = getSupabaseClient(token);

    // Verify old password by trying to sign in
    const { data: { user } } = await client.auth.getUser();
    if (!user || !user.email) {
      return res.status(400).json({ error: '无法获取用户信息' });
    }

    const { error: signInError } = await client.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });

    if (signInError) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    // Update password
    const { error: updateError } = await client.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return res.status(500).json({ error: '密码修改失败: ' + updateError.message });
    }

    return res.json({ message: '密码修改成功' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: '密码修改失败' });
  }
});

// ============ Sub-account Management (Parent only) ============

// POST /api/v1/accounts/sub-accounts - Create sub-account (parent only)
router.post('/sub-accounts', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '请提供邮箱和密码' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    const parentId = req.userId!;
    const serviceClient = getSupabaseClient();

    // Create user via service role (admin API)
    const { data: newUser, error: createError } = await (serviceClient.auth.admin as any).createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName || '子账号' },
    });

    if (createError) {
      return res.status(400).json({ error: '创建账号失败: ' + createError.message });
    }

    // Create user profile
    await serviceClient.from('user_profiles').insert({
      id: newUser.user.id,
      role: 'child',
      parentUserId: parentId,
      displayName: displayName || '子账号',
    });

    return res.status(201).json({
      id: newUser.user.id,
      email: newUser.user.email,
      displayName: displayName || '子账号',
      role: 'child',
    });
  } catch (error) {
    console.error('Create sub-account error:', error);
    return res.status(500).json({ error: '创建子账号失败' });
  }
});

// GET /api/v1/accounts/sub-accounts - List sub-accounts (parent only)
router.get('/sub-accounts', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parentId = req.userId!;
    const serviceClient = getSupabaseClient();

    const { data: profiles, error } = await serviceClient
      .from('user_profiles')
      .select('*')
      .eq('parent_user_id', parentId)
      .eq('role', 'child');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Get user details from auth
    const subAccounts = [];
    for (const profile of (profiles || [])) {
      const { data: userData } = await (serviceClient.auth.admin as any).getUserById(profile.id);
      subAccounts.push({
        id: profile.id,
        email: userData?.user?.email || '',
        displayName: profile.displayName || '子账号',
        role: profile.role,
        createdAt: profile.createdAt,
      });
    }

    return res.json(subAccounts);
  } catch (error) {
    console.error('List sub-accounts error:', error);
    return res.status(500).json({ error: '获取子账号列表失败' });
  }
});

// PUT /api/v1/accounts/sub-accounts/:id - Update sub-account (parent only)
router.put('/sub-accounts/:id', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { displayName, password } = req.body;
    const parentId = req.userId!;
    const serviceClient = getSupabaseClient();

    // Verify this sub-account belongs to this parent
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .eq('parent_user_id', parentId)
      .eq('role', 'child')
      .single();

    if (!profile) {
      return res.status(404).json({ error: '子账号不存在' });
    }

    // Update display name
    if (displayName !== undefined) {
      await serviceClient
        .from('user_profiles')
        .update({ displayName })
        .eq('id', id);
    }

    // Update password if provided
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度至少6位' });
      }
      await (serviceClient.auth.admin as any).updateUserById(id, { password });
    }

    return res.json({ message: '更新成功' });
  } catch (error) {
    console.error('Update sub-account error:', error);
    return res.status(500).json({ error: '更新子账号失败' });
  }
});

// DELETE /api/v1/accounts/sub-accounts/:id - Delete sub-account (parent only)
router.delete('/sub-accounts/:id', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parentId = req.userId!;
    const serviceClient = getSupabaseClient();

    // Verify this sub-account belongs to this parent
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .eq('parent_user_id', parentId)
      .eq('role', 'child')
      .single();

    if (!profile) {
      return res.status(404).json({ error: '子账号不存在' });
    }

    // Delete sub-account's transactions
    await serviceClient.from('transactions').delete().eq('user_id', id);
    // Delete profile
    await serviceClient.from('user_profiles').delete().eq('id', id);
    // Delete auth user
    await (serviceClient.auth.admin as any).deleteUser(id);

    return res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Delete sub-account error:', error);
    return res.status(500).json({ error: '删除子账号失败' });
  }
});

// ============ Review / Audit ============

// GET /api/v1/accounts/pending - Get pending transactions for review (parent only)
router.get('/pending', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parentId = req.userId!;
    const serviceClient = getSupabaseClient();

    // Get all sub-account IDs for this parent
    const { data: profiles } = await serviceClient
      .from('user_profiles')
      .select('id')
      .eq('parent_user_id', parentId)
      .eq('role', 'child');

    const subIds = (profiles || []).map(p => p.id);
    if (subIds.length === 0) {
      return res.json([]);
    }

    const { data: pendingTxns, error } = await serviceClient
      .from('transactions')
      .select(`
        *,
        user_profiles!transactions_user_id_fkey (display_name)
      `)
      .eq('status', 'pending')
      .in('user_id', subIds)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(pendingTxns || []);
  } catch (error) {
    console.error('Get pending error:', error);
    return res.status(500).json({ error: '获取待审核列表失败' });
  }
});

// POST /api/v1/accounts/review/:transactionId - Approve or reject (parent only)
router.post('/review/:transactionId', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { transactionId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    const parentId = req.userId!;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: '请提供有效的审核操作 (approve/reject)' });
    }

    const serviceClient = getSupabaseClient();

    // Verify the transaction belongs to a sub-account of this parent
    const { data: txn } = await serviceClient
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('status', 'pending')
      .single();

    if (!txn) {
      return res.status(404).json({ error: '待审核记录不存在' });
    }

    // Verify the transaction owner is a sub-account of this parent
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('*')
      .eq('id', txn.userId)
      .eq('parent_user_id', parentId)
      .single();

    if (!profile) {
      return res.status(403).json({ error: '无权审核此记录' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await serviceClient
      .from('transactions')
      .update({
        status: newStatus,
        reviewedBy: parentId,
        reviewedAt: new Date().toISOString(),
      })
      .eq('id', transactionId);

    return res.json({ message: action === 'approve' ? '已通过' : '已拒绝' });
  } catch (error) {
    console.error('Review error:', error);
    return res.status(500).json({ error: '审核操作失败' });
  }
});

// ============ Auto-create profile on first access ============
// POST /api/v1/accounts/ensure-profile - Called by frontend after registration
router.post('/ensure-profile', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const serviceClient = getSupabaseClient();

    // Check if profile exists
    const { data: existing } = await serviceClient
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (existing) {
      return res.json({ message: 'Profile exists', role: 'parent' });
    }

    // Create profile as parent
    await serviceClient.from('user_profiles').insert({
      id: userId,
      role: 'parent',
      parentUserId: null,
      displayName: null,
    });

    return res.status(201).json({ message: 'Profile created', role: 'parent' });
  } catch (error) {
    console.error('Ensure profile error:', error);
    return res.status(500).json({ error: '创建用户档案失败' });
  }
});

// ============ Get current user info ============
// GET /api/v1/accounts/me
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const serviceClient = getSupabaseClient();

    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const token = req.headers['x-session'] as string;
    const client = getSupabaseClient(token);
    const { data: { user } } = await client.auth.getUser();

    return res.json({
      id: userId,
      email: user?.email || '',
      displayName: profile?.displayName || user?.user_metadata?.display_name || '',
      role: profile?.role || 'parent',
      parentUserId: profile?.parentUserId || null,
    });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ error: '获取用户信息失败' });
  }
});

export default router;
