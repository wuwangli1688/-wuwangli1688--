import { Router } from "express";
import type { Request, Response } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

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

// ==================== Transactions ====================

// Helper: get visible user IDs for current user
// Parent sees own + all sub-accounts' approved transactions
// Child sees only own approved transactions
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
      .eq("status", "approved")
      .in("user_id", visibleIds);

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      query = query.lte("date", end_date as string);
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
    const { type = "expense", start_date, end_date } = req.query;
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    const visibleIds = await getVisibleUserIds(client, userId, role, parentUserId ?? null);

    let query = client
      .from("transactions")
      .select("amount, category_id, categories(name, icon, color)")
      .eq("type", type as string)
      .eq("status", "approved")
      .in("user_id", visibleIds);

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      query = query.lte("date", end_date as string);
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
    const { page = "1", size = "20", type, category_id, start_date, end_date } = req.query;
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
      .select("id, amount, type, category_id, note, date, status, user_id, created_at, categories(name, icon, color)", { count: "exact" })
      .eq("status", "approved")
      .in("user_id", visibleIds)
      .order("date", { ascending: false });

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
    const { amount, type, category_id, note, date } = req.body;
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
    const { data, error } = await client
      .from("transactions")
      .insert({
        amount: String(amount),
        type,
        category_id,
        note: note || null,
        date,
        user_id: userId,
        status,
      })
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
    const { amount, type, category_id, note, date } = req.body;
    const userId = req.userId!;

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined) updateData.amount = String(amount);
    if (type !== undefined) updateData.type = type;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (note !== undefined) updateData.note = note || null;
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

export default router;
