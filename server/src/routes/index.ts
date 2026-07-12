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

// GET /api/v1/categories - Get all categories (system defaults + user custom)
router.get("/categories", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = getSupabaseClient();
    const userId = req.userId!;

    // Get system default categories (user_id is null) + user's own categories
    const { data, error } = await client
      .from("categories")
      .select("id, name, icon, type, color, sort_order, user_id")
      .or(`user_id.is.null,user_id.eq.${userId}`)
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

    const { data, error } = await client
      .from("categories")
      .select("id, name, icon, type, color, sort_order, user_id")
      .eq("type", type as string)
      .or(`user_id.is.null,user_id.eq.${userId}`)
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
			.insert({ name, icon: icon || "📦", type, color: color || "#6B7280", user_id: userId })
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
// Child sees only own transactions
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
    // Child accounts: ALL their own transactions (including pending)
    if (role === 'parent') {
      query = query.eq("status", "approved");
    }

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      query = query.lte("date", end_date as string);
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
    // Child accounts: ALL their own transactions (including pending)
    if (role === 'parent') {
      query = query.eq("status", "approved");
    }

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      query = query.lte("date", end_date as string);
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
    const { page = "1", size = "20", type, category_id, start_date, end_date, store_id } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const sizeNum = Math.min(100, Math.max(1, parseInt(size as string)));
    const offset = (pageNum - 1) * sizeNum;

    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    const visibleIds = await getVisibleUserIds(client, userId, role, parentUserId ?? null);

    let query = client
      .from("transactions")
      .select("id, amount, type, category_id, note, date, status, user_id, store_id, created_at, categories(name, icon, color), stores(name)", { count: "exact" })
      .in("user_id", visibleIds)
      .order("date", { ascending: false });

    // Parent accounts: only approved transactions
    // Child accounts: ALL their own transactions (including pending, approved, rejected)
    if (role === 'parent') {
      query = query.eq("status", "approved");
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
      query = query.lte("date", end_date as string);
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

    res.json({
      data: data || [],
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
    // Child accounts cannot modify records
    if (req.userRole === 'child') {
      return res.status(403).json({ error: "子账号不能修改记录" });
    }

    const { id } = req.params;
    const { amount, type, category_id, note, date, project } = req.body;
    const userId = req.userId!;

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined) updateData.amount = String(amount);
    if (type !== undefined) updateData.type = type;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (note !== undefined) updateData.note = note || null;
    if (project !== undefined) updateData.project = project || null;
    if (date !== undefined) updateData.date = date;

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("transactions")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
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
    // Child accounts cannot delete records
    if (req.userRole === 'child') {
      return res.status(403).json({ error: "子账号不能删除记录" });
    }

    const { id } = req.params;
    const userId = req.userId!;
    const client = getSupabaseClient();
    const { error } = await client
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

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
