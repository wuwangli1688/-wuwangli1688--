import { Router } from "express";
import type { Request, Response } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client.js";

const router = Router();

// ==================== 分类接口 ====================

// GET /api/v1/categories - 获取所有分类
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("categories")
      .select("id, name, icon, type, color, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`查询失败: ${error.message}`);
    res.json({ data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/categories/by-type?type=expense - 按类型获取分类
router.get("/categories/by-type", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    if (!type || !["income", "expense"].includes(type as string)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("categories")
      .select("id, name, icon, type, color, sort_order")
      .eq("type", type as string)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`查询失败: ${error.message}`);
    res.json({ data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ==================== 交易记录接口 ====================

// GET /api/v1/transactions/summary - 获取汇总统计 (must be before /transactions/:id)
router.get("/transactions/summary", async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;
    const client = getSupabaseClient();

    let query = client
      .from("transactions")
      .select("id, amount, type");

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

// GET /api/v1/transactions/stats-by-category - 按分类统计
router.get("/transactions/stats-by-category", async (req: Request, res: Response) => {
  try {
    const { type = "expense", start_date, end_date } = req.query;
    const client = getSupabaseClient();

    let query = client
      .from("transactions")
      .select("amount, category_id, categories(name, icon, color)")
      .eq("type", type as string);

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
        category_id: parseInt(category_id),
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

// GET /api/v1/transactions - 获取交易记录列表
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const { page = "1", size = "20", type, category_id, start_date, end_date } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const sizeNum = Math.min(100, Math.max(1, parseInt(size as string)));
    const offset = (pageNum - 1) * sizeNum;

    const client = getSupabaseClient();
    let query = client
      .from("transactions")
      .select("id, amount, type, category_id, note, date, created_at, categories(name, icon, color)", { count: "exact" })
      .order("date", { ascending: false });

    if (type && ["income", "expense"].includes(type as string)) {
      query = query.eq("type", type as string);
    }
    if (category_id) {
      query = query.eq("category_id", parseInt(category_id as string));
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

// POST /api/v1/transactions - 创建交易记录
router.post("/transactions", async (req: Request, res: Response) => {
  try {
    const { amount, type, category_id, note, date } = req.body;

    if (!amount || !type || !category_id || !date) {
      return res.status(400).json({ error: "Missing required fields: amount, type, category_id, date" });
    }
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("transactions")
      .insert({
        amount: String(amount),
        type,
        category_id: parseInt(category_id),
        note: note || null,
        date,
      })
      .select()
      .single();

    if (error) throw new Error(`创建失败: ${error.message}`);
    res.status(201).json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PUT /api/v1/transactions/:id - 更新交易记录
router.put("/transactions/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, type, category_id, note, date } = req.body;

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined) updateData.amount = String(amount);
    if (type !== undefined) updateData.type = type;
    if (category_id !== undefined) updateData.category_id = parseInt(category_id);
    if (note !== undefined) updateData.note = note || null;
    if (date !== undefined) updateData.date = date;
    updateData.updated_at = new Date().toISOString();

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("transactions")
      .update(updateData)
      .eq("id", parseInt(id as string))
      .select()
      .single();

    if (error) throw new Error(`更新失败: ${error.message}`);
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// DELETE /api/v1/transactions/:id - 删除交易记录
router.delete("/transactions/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getSupabaseClient();
    const { error } = await client
      .from("transactions")
      .delete()
      .eq("id", parseInt(id as string));

    if (error) throw new Error(`删除失败: ${error.message}`);
    res.json({ data: { success: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
