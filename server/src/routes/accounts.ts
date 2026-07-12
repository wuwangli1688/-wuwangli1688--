import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware, requireParent } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getSupabaseClient } from '../storage/database/supabase-client.js';
import { categories, transactions, userProfiles } from '../storage/database/shared/schema.js';
import { eq, and, desc, gte, lte, inArray, isNull, or, sql } from 'drizzle-orm';

const router = Router();

// Utility: convert flexible account input to Supabase email (must match frontend)
function toSupabaseEmail(account: string): string {
  const trimmed = account.trim();
  if (trimmed.includes('@') && trimmed.includes('.')) {
    return trimmed.toLowerCase();
  }
  const encoded = encodeURIComponent(trimmed).toLowerCase();
  return `${encoded}@jizhangapp.local`;
}

// ============ Password Reset (no auth required) ============
// POST /api/v1/accounts/reset-password-request - Send reset code
router.post('/reset-password-request', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: '请提供邮箱地址' });
    }

    const adminClient = getSupabaseClient();

    // Use toSupabaseEmail to find the user consistently
    const targetEmail = toSupabaseEmail(email);

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

    // Use toSupabaseEmail to find the user consistently
    const targetEmail = toSupabaseEmail(email);

    // Verify OTP code
    const { data: verifyData, error: verifyError } = await adminClient.auth.verifyOtp({
      email: targetEmail,
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

// ============ Security Question Password Reset (no auth required) ============
// POST /api/v1/accounts/get-security-question - Get security question by email
router.post('/get-security-question', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: '请提供邮箱地址' });
    }

    const adminClient = getSupabaseClient();
    const targetEmail = toSupabaseEmail(email);

    // Find user by email in user_profiles via auth lookup
    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const user = users?.find(u => u.email === targetEmail);

    if (!user) {
      return res.status(404).json({ error: '账户不存在' });
    }

    // Query the user_profiles table for security question
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .select('security_question')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.security_question) {
      return res.status(404).json({ error: '未设置安全问题' });
    }

    return res.json({ question: profile.security_question });
  } catch (error) {
    console.error('Get security question error:', error);
    return res.status(500).json({ error: '请求失败' });
  }
});

// POST /api/v1/accounts/reset-password-with-question - Reset password using security answer
router.post('/reset-password-with-question', async (req: Request, res: Response) => {
  try {
    const { email, answer, newPassword } = req.body;
    if (!email || !answer || !newPassword) {
      return res.status(400).json({ error: '请提供邮箱、问题和答案' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: '密码长度至少8位' });
    }

    const adminClient = getSupabaseClient();
    const targetEmail = toSupabaseEmail(email);

    // Find user by email
    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const user = users?.find(u => u.email === targetEmail);

    if (!user) {
      return res.status(404).json({ error: '账户不存在' });
    }

    // Query user_profiles for security answer
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .select('security_answer')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.security_answer) {
      return res.status(400).json({ error: '未设置安全问题' });
    }

    // Compare answers case-insensitively
    if (profile.security_answer.toLowerCase() !== answer.toLowerCase()) {
      return res.status(400).json({ error: '安全问题答案错误' });
    }

    // Update the Supabase auth user's password
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(500).json({ error: '密码重置失败: ' + updateError.message });
    }

    return res.json({ message: '密码重置成功，请使用新密码登录' });
  } catch (error) {
    console.error('Reset password with question error:', error);
    return res.status(500).json({ error: '重置失败' });
  }
});

// All routes below require authentication
router.use(authMiddleware);

// ============ Security Question (auth required) ============
// POST /api/v1/accounts/set-security-question - Set or update security question
router.post('/set-security-question', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: '请提供安全问题及答案' });
    }

    const userId = req.userId!;
    const token = req.headers['x-session'] as string;
    const client = getSupabaseClient(token);

    // Update user_profiles with security question and answer
    const { error: updateError } = await client
      .from('user_profiles')
      .update({
        security_question: question,
        security_answer: answer,
      })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({ error: '设置安全问题失败: ' + updateError.message });
    }

    return res.json({ message: '安全问题设置成功' });
  } catch (error) {
    console.error('Set security question error:', error);
    return res.status(500).json({ error: '设置安全问题失败' });
  }
});

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

// ============ Profile Update (Display Name) ============

// PUT /api/v1/accounts/profile - Update display name
router.put('/profile', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { displayName } = req.body;
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: '请输入显示名称' });
    }
    const client = getSupabaseClient();
    const userId = req.userId!;

    // Update user_metadata in Supabase Auth
    const { error: authError } = await client.auth.updateUser({
      data: { display_name: displayName.trim() },
    });
    if (authError) {
      return res.status(500).json({ error: '更新失败: ' + authError.message });
    }

    // Also update user_profiles table
    await client.from('user_profiles').upsert({
      id: userId,
      displayName: displayName.trim(),
    }, { onConflict: 'id' });

    return res.json({ message: '更新成功', displayName: displayName.trim() });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: '更新失败' });
  }
});

// ============ Sub-account Management (Parent only) ============

// POST /api/v1/accounts/sub-accounts - Create sub-account (parent only)
router.post('/sub-accounts', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, password, store_ids } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请提供用户名和密码' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    const parentId = req.userId!;
    const serviceClient = getSupabaseClient();
    const supabaseEmail = toSupabaseEmail(username);

    // Create user via service role (admin API)
    const { data: newUser, error: createError } = await (serviceClient.auth.admin as any).createUser({
      email: supabaseEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: username },
    });

    if (createError) {
      // If email already registered, check if it's a child of this parent that we can reclaim
      if (createError.message?.includes('already registered')) {
        // Try to find the existing user by listing users and matching email
        const { data: userList } = await (serviceClient.auth.admin as any).listUsers();
        const existingUser = userList?.users?.find((u: any) => u.email === supabaseEmail);
        if (existingUser) {
          // Check if this user is a child of the current parent
          const { data: existingProfile } = await serviceClient
            .from('user_profiles')
            .select('id, role, parent_user_id')
            .eq('id', existingUser.id)
            .single();

          if (existingProfile && existingProfile.role === 'child' && existingProfile.parent_user_id === parentId) {
            // This sub-account already exists, update their password and return success
            await (serviceClient.auth.admin as any).updateUserById(existingUser.id, {
              password,
              email_confirm: true,
            });

            // Update display name in profile
            await serviceClient.from('user_profiles').update({
              display_name: username,
            }).eq('id', existingUser.id);

            // Update store permissions if provided
            if (store_ids && Array.isArray(store_ids) && store_ids.length > 0) {
              // Remove old permissions
              await serviceClient.from('store_permissions').delete().eq('user_id', existingUser.id);
              // Insert new permissions
              const inserts = store_ids.map((storeId: string) => ({
                store_id: storeId,
                user_id: existingUser.id,
                granted_by: parentId,
              }));
              await serviceClient.from('store_permissions').insert(inserts);
            }

            return res.status(200).json({
              id: existingUser.id,
              username,
              role: 'child',
              store_ids: store_ids || [],
              message: '子账号已更新',
            });
          }

          return res.status(400).json({ error: '该用户名已被使用，请使用其他用户名' });
        }
      }
      return res.status(400).json({ error: '创建账号失败: ' + createError.message });
    }

    const newUserId = newUser.user.id;

    // Create user profile
    await serviceClient.from('user_profiles').insert({
      id: newUserId,
      role: 'child',
      parent_user_id: parentId,
      display_name: username,
    });

    // Grant store permissions if store_ids provided
    if (store_ids && Array.isArray(store_ids) && store_ids.length > 0) {
      const inserts = store_ids.map((storeId: string) => ({
        store_id: storeId,
        user_id: newUserId,
        granted_by: parentId,
      }));
      const { error: permError } = await serviceClient
        .from('store_permissions')
        .insert(inserts);
      if (permError) {
        console.error('Grant store permissions error:', permError);
      }
    }

    return res.status(201).json({
      id: newUserId,
      username,
      role: 'child',
      store_ids: store_ids || [],
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

    // Get user details from auth and permissions
    const subAccounts = [];
    for (const profile of (profiles || [])) {
      const { data: userData } = await (serviceClient.auth.admin as any).getUserById(profile.id);

      // Get store permissions for this sub-account
      const { data: storePerms } = await serviceClient
        .from('store_permissions')
        .select('store_id')
        .eq('user_id', profile.id);
      const permissionStoreIds = (storePerms || []).map((p: any) => p.store_id);

      // Extract username from email (reverse of toSupabaseEmail)
      const email = userData?.user?.email || '';
      let username = '';
      if (email.includes('@jizhangapp.local')) {
        username = decodeURIComponent(email.replace('@jizhangapp.local', ''));
      } else {
        username = email.replace(/@.*$/, '');
      }

      subAccounts.push({
        id: profile.id,
        username: username,
        displayName: profile.display_name || profile.displayName || username || '子账号',
        role: profile.role,
        createdAt: profile.created_at || profile.createdAt || new Date().toISOString(),
        store_ids: permissionStoreIds,
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
    const { displayName, password, store_ids } = req.body;
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
        .update({ display_name: displayName })
        .eq('id', id);
    }

    // Update password if provided
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度至少6位' });
      }
      await (serviceClient.auth.admin as any).updateUserById(id, { password });
    }

    // Update store permissions if store_ids provided
    if (store_ids !== undefined && Array.isArray(store_ids)) {
      // Clear existing permissions
      await serviceClient
        .from('store_permissions')
        .delete()
        .eq('user_id', id);

      // Insert new permissions
      if (store_ids.length > 0) {
        const inserts = store_ids.map((storeId: string) => ({
          store_id: storeId,
          user_id: id,
          granted_by: parentId,
        }));
        const { error: permError } = await serviceClient
          .from('store_permissions')
          .insert(inserts);
        if (permError) {
          console.error('Update store permissions error:', permError);
        }
      }
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
      parent_user_id: null,
      display_name: null,
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
      displayName: profile?.display_name || user?.user_metadata?.display_name || '',
      role: profile?.role || 'parent',
      parentUserId: profile?.parent_user_id || null,
    });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ error: '获取用户信息失败' });
  }
});

export default router;
