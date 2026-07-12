import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, requireParent } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getSupabaseClient } from '../storage/database/supabase-client.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ============ Store CRUD ============

// GET /api/v1/stores - Get stores visible to current user
// All users see stores owned by their parent account (or own if parent)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    let stores: any[];

    if (role === 'parent') {
      // Parent: all stores they own
      const ownerId = userId;
      const { data, error } = await client
        .from('stores')
        .select('id, name, notes, owner_id, created_at')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      stores = data || [];
    } else {
      // Child: only stores they have permission to
      const { data: permissions } = await client
        .from('store_permissions')
        .select('store_id')
        .eq('user_id', userId);
      const storeIds = (permissions || []).map(p => p.store_id);
      if (storeIds.length === 0) {
        return res.json({ data: [] });
      }
      const { data, error } = await client
        .from('stores')
        .select('id, name, notes, owner_id, created_at')
        .in('id', storeIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      stores = data || [];
    }

    // For each store, get permission count
    const storesWithCounts = await Promise.all(
      (stores || []).map(async (store: any) => {
        const { count } = await client
          .from('store_permissions')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', store.id);
        return { ...store, permissionCount: count || 0 };
      })
    );

    return res.json({ data: storesWithCounts });
  } catch (error) {
    console.error('Get stores error:', error);
    return res.status(500).json({ error: '获取店铺列表失败' });
  }
});

// POST /api/v1/stores - Create a store (all users can create, child accounts' stores owned by parent)
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, notes } = req.body;
    console.log('[Store Create] Request body:', { name, notes });
    console.log('[Store Create] User info:', { userId: req.userId, role: req.userRole, parentUserId: req.parentUserId });

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '请提供店铺名称' });
    }

    const client = getSupabaseClient();
    const role = req.userRole!;
    const parentUserId = req.parentUserId;
    // Child accounts' stores are owned by the parent; parent accounts own their own
    const ownerId = role === 'parent' ? req.userId! : parentUserId;
    
    if (!ownerId) {
      console.error('[Store Create] No owner ID available', { role, parentUserId, userId: req.userId });
      return res.status(400).json({ error: '无法确定店铺所有者' });
    }
    
    console.log('[Store Create] Owner ID:', ownerId);

    const { data, error } = await client
      .from('stores')
      .insert({ name: name.trim(), notes: notes || null, owner_id: ownerId })
      .select()
      .single();

    if (error) {
      console.error('[Store Create] Supabase error:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: `创建店铺失败: ${error.message || '数据库错误'}` });
    }

    if (!data) {
      console.error('[Store Create] No data returned from insert');
      return res.status(500).json({ error: '创建店铺失败: 未返回数据' });
    }

    console.log('[Store Create] Success:', data);
    return res.status(201).json({ data, message: '店铺创建成功' });
  } catch (error) {
    console.error('[Store Create] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return res.status(500).json({ error: `创建店铺失败: ${errorMessage}` });
  }
});

// POST /api/v1/stores/permissions - Batch set permissions for a sub-account (parent only)
router.post('/permissions', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user_id, store_ids } = req.body;
    if (!user_id || !Array.isArray(store_ids)) {
      return res.status(400).json({ error: '请提供子账号ID和店铺ID列表' });
    }

    const client = getSupabaseClient();
    const ownerId = req.userId!;

    // Verify target user is a sub-account of this parent
    const { data: profile } = await client
      .from('user_profiles')
      .select('id')
      .eq('id', user_id)
      .eq('parent_user_id', ownerId)
      .eq('role', 'child')
      .single();

    if (!profile) {
      return res.status(400).json({ error: '目标用户不是您的子账号' });
    }

    // Remove all existing permissions for this user
    await client.from('store_permissions').delete().eq('user_id', user_id);

    // Insert new permissions for selected stores
    if (store_ids.length > 0) {
      const inserts = store_ids.map((storeId: string) => ({
        store_id: storeId,
        user_id: user_id,
        granted_by: ownerId,
      }));
      const { error } = await client.from('store_permissions').insert(inserts);
      if (error) throw error;
    }

    return res.json({ message: '权限已更新' });
  } catch (error) {
    console.error('Batch set permissions error:', error);
    return res.status(500).json({ error: '更新权限失败' });
  }
});

// PUT /api/v1/stores/:id - Update store name (all users can update, child accounts' stores owned by parent)
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, notes } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '请提供店铺名称' });
    }

    const client = getSupabaseClient();
    const role = req.userRole!;
    const parentUserId = req.parentUserId;
    const ownerId = role === 'parent' ? req.userId! : parentUserId!;

    // Verify ownership
    const { data: store } = await client
      .from('stores')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!store) {
      return res.status(404).json({ error: '店铺不存在或无权操作' });
    }

    const updateData: any = { name: name.trim() };
    if (notes !== undefined) updateData.notes = notes || null;

    const { error } = await client
      .from('stores')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    return res.json({ message: '店铺名称已更新' });
  } catch (error) {
    console.error('Update store error:', error);
    return res.status(500).json({ error: '更新店铺失败' });
  }
});

// DELETE /api/v1/stores/:id - Delete a store (all users can delete, child accounts' stores owned by parent)
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const client = getSupabaseClient();
    const role = req.userRole!;
    const parentUserId = req.parentUserId;
    const ownerId = role === 'parent' ? req.userId! : parentUserId!;

    // Verify ownership
    const { data: store } = await client
      .from('stores')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!store) {
      return res.status(404).json({ error: '店铺不存在或无权操作' });
    }

    // Delete permissions first
    await client.from('store_permissions').delete().eq('store_id', id);
    // Delete the store
    await client.from('stores').delete().eq('id', id);

    return res.json({ message: '店铺已删除' });
  } catch (error) {
    console.error('Delete store error:', error);
    return res.status(500).json({ error: '删除店铺失败' });
  }
});

// ============ Store Permissions ============

// GET /api/v1/stores/:id/permissions - Get permissions for a store (parent only)
router.get('/:id/permissions', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const client = getSupabaseClient();
    const ownerId = req.userId!;

    // Verify ownership
    const { data: store } = await client
      .from('stores')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!store) {
      return res.status(404).json({ error: '店铺不存在或无权操作' });
    }

    // Get permissions with user info
    const { data: permissions, error } = await client
      .from('store_permissions')
      .select('id, user_id, created_at')
      .eq('store_id', id);

    if (error) throw error;

    // Enrich with user display names
    const enriched = await Promise.all(
      (permissions || []).map(async (perm: any) => {
        const { data: profile } = await client
          .from('user_profiles')
          .select('display_name')
          .eq('id', perm.user_id)
          .single();
        return {
          id: perm.id,
          userId: perm.user_id,
          displayName: profile?.display_name || '子账号',
          createdAt: perm.created_at,
        };
      })
    );

    return res.json(enriched);
  } catch (error) {
    console.error('Get permissions error:', error);
    return res.status(500).json({ error: '获取权限列表失败' });
  }
});

// POST /api/v1/stores/:id/permissions - Grant permission to sub-account (parent only)
router.post('/:id/permissions', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: '请提供子账号ID' });
    }

    const client = getSupabaseClient();
    const ownerId = req.userId!;

    // Verify store ownership
    const { data: store } = await client
      .from('stores')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!store) {
      return res.status(404).json({ error: '店铺不存在或无权操作' });
    }

    // Verify target user is a sub-account of this parent
    const { data: profile } = await client
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .eq('parent_user_id', ownerId)
      .eq('role', 'child')
      .single();

    if (!profile) {
      return res.status(400).json({ error: '目标用户不是您的子账号' });
    }

    // Check if permission already exists
    const { data: existing } = await client
      .from('store_permissions')
      .select('id')
      .eq('store_id', id)
      .eq('user_id', userId)
      .single();

    if (existing) {
      return res.status(400).json({ error: '该子账号已有此店铺权限' });
    }

    // Grant permission
    const { data, error } = await client
      .from('store_permissions')
      .insert({ store_id: id, user_id: userId, granted_by: ownerId })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ data, message: '权限已授予' });
  } catch (error) {
    console.error('Grant permission error:', error);
    return res.status(500).json({ error: '授予权限失败' });
  }
});

// PUT /api/v1/stores/:id/permissions - Batch set which users can access this store (parent only)
router.put('/:id/permissions', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user_ids } = req.body;
    if (!Array.isArray(user_ids)) {
      return res.status(400).json({ error: '请提供用户ID列表' });
    }

    const client = getSupabaseClient();
    const ownerId = req.userId!;

    // Verify store ownership
    const { data: store } = await client
      .from('stores')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!store) {
      return res.status(404).json({ error: '店铺不存在或无权操作' });
    }

    // Remove all existing permissions for this store
    await client.from('store_permissions').delete().eq('store_id', id);

    // Insert new permissions for selected users
    if (user_ids.length > 0) {
      const inserts = user_ids.map((userId: string) => ({
        store_id: id,
        user_id: userId,
        granted_by: ownerId,
        role: 'viewer',
      }));
      const { error } = await client.from('store_permissions').insert(inserts);
      if (error) throw error;
    }

    return res.json({ message: '权限已更新' });
  } catch (error) {
    console.error('Batch set store permissions error:', error);
    return res.status(500).json({ error: '更新权限失败' });
  }
});

// GET /api/v1/stores/:id/permissions/users - Get users who can access this store (parent only)
router.get('/:id/permissions/users', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const client = getSupabaseClient();
    const ownerId = req.userId!;

    // Verify store ownership
    const { data: store } = await client
      .from('stores')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!store) {
      return res.status(404).json({ error: '店铺不存在或无权操作' });
    }

    // Get user_ids from store_permissions
    const { data: permissions } = await client
      .from('store_permissions')
      .select('user_id')
      .eq('store_id', id);

    const userIds = (permissions || []).map(p => p.user_id);
    return res.json({ data: userIds });
  } catch (error) {
    console.error('Get store permission users error:', error);
    return res.status(500).json({ error: '获取权限用户失败' });
  }
});

// DELETE /api/v1/stores/:storeId/permissions/:userId - Revoke permission (parent only)
router.delete('/:storeId/permissions/:userId', requireParent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, userId: targetUserId } = req.params;
    const client = getSupabaseClient();
    const ownerId = req.userId!;

    // Verify store ownership
    const { data: store } = await client
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('owner_id', ownerId)
      .single();

    if (!store) {
      return res.status(404).json({ error: '店铺不存在或无权操作' });
    }

    const { error } = await client
      .from('store_permissions')
      .delete()
      .eq('store_id', storeId)
      .eq('user_id', targetUserId);

    if (error) throw error;

    return res.json({ message: '权限已撤销' });
  } catch (error) {
    console.error('Revoke permission error:', error);
    return res.status(500).json({ error: '撤销权限失败' });
  }
});

export default router;
