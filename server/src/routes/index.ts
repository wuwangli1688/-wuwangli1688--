import { Router } from "express";
import type { Request, Response } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import shareRouter from "./share.js";

const router = Router();

// Public routes (no auth required)
router.use("/share", shareRouter);

// All business routes require authentication
router.use(authMiddleware);

// ==================== Categories ====================

// GET /api/v1/categories - Get all categories (system defaults + user/parent custom)
router.get("/categories", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    // Get system default categories (user_id is null) + user's own categories
    // For child accounts, also include parent's custom categories
    let categoryFilter = `user_id.is.null,user_id.eq.${userId}`;
    if (role === 'child' && parentUserId) {
      categoryFilter += `,user_id.eq.${parentUserId}`;
    }

    const { data, error } = await client
      .from("categories")
      .select("id, name, icon, type, color, sort_order, user_id")
      .or(categoryFilter)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`查询失败: ${error.message}`);
    res.json({ data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/categories/by-type?type=expense
router.get("/categories/by-type", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type } = req.query;
    if (!type || !["income", "expense"].includes(type as string)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    // For child accounts, also include parent's custom categories
    let categoryFilter = `user_id.is.null,user_id.eq.${userId}`;
    if (role === 'child' && parentUserId) {
      categoryFilter += `,user_id.eq.${parentUserId}`;
    }

    const { data, error } = await client
      .from("categories")
      .select("id, name, icon, type, color, sort_order, user_id")
      .eq("type", type as string)
      .or(categoryFilter)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`查询失败: ${error.message}`);
    res.json({ data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /api/v1/categories - Create custom category
router.post("/categories", async (req: AuthenticatedRequest, res: Response) => {
	try {
		// Child accounts cannot manage categories
		if (req.userRole === 'child') {
			return res.status(403).json({ error: "子账号不能管理分类" });
		}
		const client = getSupabaseClient();
		const userId = req.userId!;
		const { name, icon, type, color } = req.body;
		if (!name || !type) return res.status(400).json({ error: "name and type are required" });
		if (!["income", "expense"].includes(type)) return res.status(400).json({ error: "type must be 'income' or 'expense'" });

		const { data, error } = await client
			.from("categories")
			.insert({ name, icon: icon || "box", type, color: color || "#6B7280", user_id: userId })
			.select("id, name, icon, type, color, sort_order, user_id")
			.single();
		if (error) throw new Error(`创建失败: ${error.message}`);
		res.json({ data });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		res.status(500).json({ error: message });
	}
});

// PUT /api/v1/categories/:id - Update category (parent can edit system defaults)
router.put("/categories/:id", async (req: AuthenticatedRequest, res: Response) => {
	try {
		// Child accounts cannot manage categories
		if (req.userRole === 'child') {
			return res.status(403).json({ error: "子账号不能管理分类" });
		}
		const client = getSupabaseClient();
		const userId = req.userId!;
		const role = req.userRole!;
		const { id } = req.params;
		const { name, icon, color } = req.body;

		const { data: existing } = await client.from("categories").select("user_id").eq("id", id).single();
		if (!existing) return res.status(404).json({ error: "分类不存在" });

		// System default categories (user_id is null): only parent accounts can edit
		// Custom categories: only the owner can edit
		if (existing.user_id === null) {
			if (role !== 'parent') {
				return res.status(403).json({ error: "只有主账号可以修改系统默认分类" });
			}
		} else if (existing.user_id !== userId) {
			return res.status(403).json({ error: "无权修改此分类" });
		}

		const updates: any = {};
		if (name) updates.name = name;
		if (icon) updates.icon = icon;
		if (color) updates.color = color;

		// For system defaults, don't filter by user_id (it's null)
		const query = client.from("categories").update(updates).eq("id", id);
		if (existing.user_id !== null) {
			query.eq("user_id", userId);
		}

		const { data, error } = await query
			.select("id, name, icon, type, color, sort_order, user_id")
			.single();
		if (error) throw new Error(`更新失败: ${error.message}`);
		res.json({ data });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		res.status(500).json({ error: message });
	}
});

// DELETE /api/v1/categories/:id - Delete custom category
router.delete("/categories/:id", async (req: AuthenticatedRequest, res: Response) => {
	try {
		// Child accounts cannot manage categories
		if (req.userRole === 'child') {
			return res.status(403).json({ error: "子账号不能管理分类" });
		}
		const client = getSupabaseClient();
		const userId = req.userId!;
		const { id } = req.params;

		const { data: existing } = await client.from("categories").select("user_id").eq("id", id).single();
		if (!existing) return res.status(404).json({ error: "分类不存在" });
		if (existing.user_id !== userId) return res.status(403).json({ error: "不能删除系统默认分类" });

		const { error } = await client.from("categories").delete().eq("id", id).eq("user_id", userId);
		if (error) throw new Error(`删除失败: ${error.message}`);
		res.json({ message: "删除成功" });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		res.status(500).json({ error: message });
	}
});

// ==================== Transactions ====================

// Helper: get visible user IDs for current user
// Parent sees own + all sub-accounts' transactions
// Child sees own transactions + parent's approved transactions
async function getVisibleUserIds(client: any, userId: string, role: string, parentUserId: string | null): Promise<string[]> {
  if (role === 'parent') {
    // Get sub-account IDs
    const { data: profiles } = await client
      .from('user_profiles')
      .select('id')
      .eq('parent_user_id', userId)
      .eq('role', 'child');
    const subIds = (profiles || []).map((p: any) => p.id);
    return [userId, ...subIds];
  } else {
    // Child account: see own transactions + parent's approved transactions
    if (parentUserId) {
      const { data: siblingProfiles } = await client
        .from('user_profiles')
        .select('id')
        .eq('parent_user_id', parentUserId)
        .eq('role', 'child');
      const siblingIds = (siblingProfiles || []).map((p: any) => p.id);
      return [parentUserId, userId, ...siblingIds.filter((id: string) => id !== userId)];
    }
    return [userId];
  }
}

// Helper: get visible store IDs for current user
// Parent sees all their stores; Child sees only permitted stores
async function getVisibleStoreIds(client: any, userId: string, role: string): Promise<string[]> {
  if (role === 'parent') {
    const { data } = await client
      .from('stores')
      .select('id')
      .eq('owner_id', userId);
    return (data || []).map((s: any) => s.id);
  } else {
    const { data } = await client
      .from('store_permissions')
      .select('store_id')
      .eq('user_id', userId);
    return (data || []).map((p: any) => p.store_id);
  }
}

// GET /api/v1/transactions/summary
router.get("/transactions/summary", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start_date, end_date } = req.query;
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    const visibleIds = await getVisibleUserIds(client, userId, role, parentUserId ?? null);

    let query = client
      .from("transactions")
      .select("id, amount, type")
      .in("user_id", visibleIds);

    // Parent accounts: only approved transactions
    // Child accounts: own pending + all approved
    if (role === 'parent') {
      query = query.eq("status", "approved");
    } else {
      query = query.or(`and(user_id.eq.${userId},status.neq.pending_delete),and(status.eq.approved,user_id.neq.${userId})`);
    }

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      // date column is timestamptz, use lt with next day to include all times
      const d = new Date((end_date as string) + 'T00:00:00Z');
      d.setDate(d.getDate() + 1);
      query = query.lt("date", d.toISOString());
    }
    // Store filtering for summary
    if (req.query.store_id) {
      query = query.eq("store_id", req.query.store_id as string);
    } else if (role === 'child') {
      const visibleStoreIds = await getVisibleStoreIds(client, userId, role);
      if (visibleStoreIds.length > 0) {
        query = query.or(`store_id.is.null,store_id.in.(${visibleStoreIds.join(',')})`);
      } else {
        query = query.is("store_id", null);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    let total_income = 0;
    let total_expense = 0;
    for (const item of data || []) {
      if (item.type === "income") {
        total_income += parseFloat(item.amount);
      } else {
        total_expense += parseFloat(item.amount);
      }
    }

    res.json({
      data: {
        total_income: total_income.toFixed(2),
        total_expense: total_expense.toFixed(2),
        balance: (total_income - total_expense).toFixed(2),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/transactions/stats-by-category
router.get("/transactions/stats-by-category", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type = "expense", start_date, end_date, store_id } = req.query;
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    const visibleIds = await getVisibleUserIds(client, userId, role, parentUserId ?? null);

    let query = client
      .from("transactions")
      .select("amount, category_id, categories(name, icon, color)")
      .eq("type", type as string)
      .in("user_id", visibleIds);

    // Parent accounts: only approved transactions
    // Child accounts: own pending + all approved
    if (role === 'parent') {
      query = query.eq("status", "approved");
    } else {
      query = query.or(`and(user_id.eq.${userId},status.neq.pending_delete),and(status.eq.approved,user_id.neq.${userId})`);
    }

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      // date column is timestamptz, use lt with next day to include all times
      const d = new Date((end_date as string) + 'T00:00:00Z');
      d.setDate(d.getDate() + 1);
      query = query.lt("date", d.toISOString());
    }
    if (store_id) {
      query = query.eq("store_id", store_id as string);
    } else if (role === 'child') {
      const visibleStoreIds = await getVisibleStoreIds(client, userId, role);
      if (visibleStoreIds.length > 0) {
        query = query.or(`store_id.is.null,store_id.in.(${visibleStoreIds.join(',')})`);
      } else {
        query = query.is("store_id", null);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    const categoryMap = new Map<string, { name: string; icon: string; color: string; total: number; count: number }>();
    for (const item of data || []) {
      const cat = item.categories as unknown as { name: string; icon: string; color: string };
      const key = String(item.category_id);
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { name: cat.name, icon: cat.icon, color: cat.color, total: 0, count: 0 });
      }
      const entry = categoryMap.get(key)!;
      entry.total += parseFloat(item.amount);
      entry.count += 1;
    }

    const result = Array.from(categoryMap.entries())
      .map(([category_id, info]) => ({
        category_id,
        name: info.name,
        icon: info.icon,
        color: info.color,
        total: info.total.toFixed(2),
        count: info.count,
      }))
      .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

    res.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/transactions
router.get("/transactions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = "1", size = "1000", type, category_id, start_date, end_date, store_id } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const sizeNum = Math.min(1000, Math.max(1, parseInt(size as string)));
    const offset = (pageNum - 1) * sizeNum;

    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    const visibleIds = await getVisibleUserIds(client, userId, role, parentUserId ?? null);

    // Also fetch all categories upfront for mapping (in case joins fail)
    const { data: allCategories } = await client
      .from("categories")
      .select("id, name, icon, color");
    const categoryMap = new Map((allCategories || []).map((c: any) => [c.id, c]));

    let query = client
      .from("transactions")
      .select("id, amount, type, category_id, note, project, date, status, user_id, store_id, created_at, reviewed_at, categories(name, icon, color), stores(name)", { count: "exact" })
      .in("user_id", visibleIds)
      .order("created_at", { ascending: true });

    // Parent accounts: only approved transactions
    // Child accounts: own pending + all approved (parent + siblings), exclude pending_delete
    if (role === 'parent') {
      query = query.eq("status", "approved");
    } else {
      // Child: own transactions (any status except pending_delete) + all other users' approved transactions
      query = query.or(`and(user_id.eq.${userId},status.neq.pending_delete),and(status.eq.approved,user_id.neq.${userId})`);
    }

    if (type && ["income", "expense"].includes(type as string)) {
      query = query.eq("type", type as string);
    }
    if (category_id) {
      query = query.eq("category_id", category_id as string);
    }
    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      // date column is timestamptz, use lt with next day to include all times
      const d = new Date((end_date as string) + 'T00:00:00Z');
      d.setDate(d.getDate() + 1);
      query = query.lt("date", d.toISOString());
    }
    // Store filtering
    if (store_id) {
      query = query.eq("store_id", store_id as string);
    } else if (role === 'child') {
      // Child accounts: only show transactions from permitted stores
      const visibleStoreIds = await getVisibleStoreIds(client, userId, role);
      // Show transactions with no store OR in permitted stores
      if (visibleStoreIds.length > 0) {
        query = query.or(`store_id.is.null,store_id.in.(${visibleStoreIds.join(',')})`);
      } else {
        query = query.is("store_id", null);
      }
    }

    const { data, error, count } = await query.range(offset, offset + sizeNum - 1);
    if (error) throw new Error(`查询失败: ${error.message}`);

    // Enrich categories for transactions where the join returned null
    const enrichedData = (data || []).map((txn: any) => {
      if (!txn.categories && txn.category_id) {
        const cat = categoryMap.get(txn.category_id);
        if (cat) {
          txn.categories = { name: cat.name, icon: cat.icon, color: cat.color };
        }
      }
      return txn;
    });

    res.json({
      data: enrichedData,
      pagination: {
        page: pageNum,
        size: sizeNum,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / sizeNum),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/transactions/:id - Get single transaction detail
router.get("/transactions/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    const visibleIds = await getVisibleUserIds(client, userId, role, parentUserId ?? null);

    const { data, error } = await client
      .from("transactions")
      .select("id, amount, type, category_id, note, project, date, status, user_id, store_id, created_at, updated_at, categories(name, icon, color), stores(name)")
      .eq("id", id)
      .in("user_id", visibleIds)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: "记录不存在" });
      }
      throw new Error(`查询失败: ${error.message}`);
    }

    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /api/v1/transactions - Create transaction
// For child accounts, status is 'pending' (needs parent approval)
// For parent accounts, status is 'approved' directly
router.post("/transactions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, type, category_id, note, date, store_id, project } = req.body;
    const userId = req.userId!;
    const role = req.userRole!;

    if (!amount || !type || !category_id || !date) {
      return res.status(400).json({ error: "缺少必填字段: amount, type, category_id, date" });
    }
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }

    // Check sub-account permissions
    if (role === 'child') {
      const { data: profile } = await getSupabaseClient()
        .from('user_profiles')
        .select('permissions')
        .eq('id', userId)
        .single();
      const perms = profile?.permissions || [];
      if (!perms.includes('create')) {
        return res.status(403).json({ error: "没有录入数据权限" });
      }
    }

    const status = role === 'child' ? 'pending' : 'approved';

    const client = getSupabaseClient();
    const insertData: any = {
      amount: String(amount),
      type,
      category_id,
      note: note || null,
      project: project || null,
      date,
      user_id: userId,
      status,
    };
    if (store_id) {
      insertData.store_id = store_id;
    }

    const { data, error } = await client
      .from("transactions")
      .insert(insertData)
      .select()
      .single();

    if (error) throw new Error(`创建失败: ${error.message}`);
    res.status(201).json({ data, message: status === 'pending' ? '已提交，等待主账号审核' : '创建成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PUT /api/v1/transactions/:id
router.put("/transactions/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, type, category_id, note, date, project, store_id } = req.body;
    const userId = req.userId!;
    const role = req.userRole!;
    const client = getSupabaseClient();

    // First, find the transaction to check ownership
    const { data: existingTx, error: findError } = await client
      .from("transactions")
      .select("user_id, amount, type, category_id, note, project, date, store_id, status")
      .eq("id", id)
      .single();

    if (findError || !existingTx) {
      return res.status(404).json({ error: "记录不存在" });
    }

    const txOwnerId = existingTx.user_id;

    if (role === 'child') {
      // Child account: check permissions
      const { data: profile } = await client
        .from('user_profiles')
        .select('permissions')
        .eq('id', userId)
        .single();
      const perms = profile?.permissions || [];

      if (!perms.includes('modify')) {
        return res.status(403).json({ error: "没有修改数据权限" });
      }

      // Can only modify own transactions
      if (txOwnerId !== userId) {
        return res.status(403).json({ error: "无权修改此记录" });
      }

      // Save old data for potential revert, then set status to pending
      const oldData = {
        amount: existingTx.amount,
        type: existingTx.type,
        category_id: existingTx.category_id,
        note: existingTx.note,
        project: existingTx.project,
        date: existingTx.date,
        store_id: existingTx.store_id,
      };

      const updateData: Record<string, unknown> = {};
      if (amount !== undefined) updateData.amount = String(amount);
      if (type !== undefined) updateData.type = type;
      if (category_id !== undefined) updateData.category_id = category_id;
      if (note !== undefined) updateData.note = note || null;
      if (project !== undefined) updateData.project = project || null;
      if (date !== undefined) updateData.date = date;
      if (store_id !== undefined) updateData.store_id = store_id;
      updateData.status = 'pending';
      updateData.pending_edit_data = oldData;
      updateData.reviewed_by = null;
      updateData.reviewed_at = null;

      const { data, error } = await client
        .from("transactions")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`修改失败: ${error.message}`);
      return res.json({ data, message: '已修改，等待主账号审核' });
    }

    // For parent accounts: allow editing if the transaction belongs to them or their sub-accounts
    if (txOwnerId !== userId) {
      // Check if the transaction belongs to a sub-account
      const { data: subProfile } = await client
        .from("user_profiles")
        .select("id")
        .eq("id", txOwnerId)
        .eq("parent_user_id", userId)
        .eq("role", "child")
        .maybeSingle();

      if (!subProfile) {
        return res.status(403).json({ error: "无权修改此记录" });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined) updateData.amount = String(amount);
    if (type !== undefined) updateData.type = type;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (note !== undefined) updateData.note = note || null;
    if (project !== undefined) updateData.project = project || null;
    if (date !== undefined) updateData.date = date;
    if (store_id !== undefined) updateData.store_id = store_id;

    const { data, error } = await client
      .from("transactions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`更新失败: ${error.message}`);
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// DELETE /api/v1/transactions/:id
router.delete("/transactions/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const role = req.userRole!;
    const client = getSupabaseClient();

    // First, find the transaction
    const { data: existingTx, error: findError } = await client
      .from("transactions")
      .select("user_id, status")
      .eq("id", id)
      .single();

    if (findError || !existingTx) {
      return res.status(404).json({ error: "记录不存在" });
    }

    const txOwnerId = existingTx.user_id;

    if (role === 'child') {
      // Child account: check permissions
      const { data: profile } = await client
        .from('user_profiles')
        .select('permissions')
        .eq('id', userId)
        .single();
      const perms = profile?.permissions || [];

      if (!perms.includes('delete')) {
        return res.status(403).json({ error: "没有删除数据权限" });
      }

      // Can only delete own transactions
      if (txOwnerId !== userId) {
        return res.status(403).json({ error: "无权删除此记录" });
      }

      // If transaction is still pending, delete directly
      if (existingTx.status === 'pending') {
        const { error } = await client
          .from("transactions")
          .delete()
          .eq("id", id);
        if (error) throw new Error(`删除失败: ${error.message}`);
        return res.json({ data: { success: true }, message: '删除成功' });
      }

      // If approved, set to pending_delete for parent review
      const { error } = await client
        .from("transactions")
        .update({
          status: 'pending_delete',
          reviewed_by: null,
          reviewed_at: null,
        })
        .eq("id", id);

      if (error) throw new Error(`请求删除失败: ${error.message}`);
      return res.json({ data: { success: true }, message: '已提交删除请求，等待主账号审核' });
    }

    // Parent accounts can delete any transaction (including sub-account's)
    const { error } = await client
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`删除失败: ${error.message}`);
    res.json({ data: { success: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

import exportRouter from "./export.js";

// ==================== Export ====================
router.use("/export", exportRouter);

import accountsRouter from "./accounts.js";

// ==================== Account Management ====================
router.use("/accounts", accountsRouter);

import storesRouter from "./stores.js";

// ==================== Stores (店铺) ====================
router.use("/stores", storesRouter);

export default router;
