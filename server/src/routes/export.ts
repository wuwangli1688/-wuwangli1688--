import { Router } from "express";
import type { Response } from "express";
import ExcelJS from "exceljs";
import { getSupabaseClient } from "../storage/database/supabase-client.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/export/transactions - Export transactions to Excel
router.get("/transactions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start_date, end_date, store_id } = req.query;
    const client = getSupabaseClient();
    const userId = req.userId!;
    const role = req.userRole!;
    const parentUserId = req.parentUserId;

    // Determine visible user IDs
    let visibleIds = [userId];
    if (role === 'parent') {
      const { data: profiles } = await client
        .from('user_profiles')
        .select('id')
        .eq('parent_user_id', userId)
        .eq('role', 'child');
      const subIds = (profiles || []).map((p: any) => p.id);
      visibleIds = [userId, ...subIds];
    }

    let query = client
      .from("transactions")
      .select("id, amount, type, category_id, note, date, store_id, categories(name), stores(name)")
      .eq("status", "approved")
      .in("user_id", visibleIds)
      .order("date", { ascending: true });

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      query = query.lte("date", end_date as string);
    }
    if (store_id) {
      query = query.eq("store_id", store_id as string);
    } else if (role === 'child') {
      // Child accounts: only export from permitted stores
      const { data: perms } = await client
        .from('store_permissions')
        .select('store_id')
        .eq('user_id', userId);
      const visibleStoreIds = (perms || []).map((p: any) => p.store_id);
      if (visibleStoreIds.length > 0) {
        query = query.or(`store_id.is.null,store_id.in.(${visibleStoreIds.join(',')})`);
      } else {
        query = query.is("store_id", null);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    const transactions = data || [];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheet1");

    worksheet.columns = [
      { header: "日期", key: "date", width: 14 },
      { header: "序号", key: "seq", width: 8 },
      { header: "店铺", key: "store", width: 12 },
      { header: "分类", key: "category", width: 10 },
      { header: "项目", key: "project", width: 16 },
      { header: "收入", key: "income", width: 12 },
      { header: "支出", key: "expense", width: 12 },
      { header: "余额", key: "balance", width: 12 },
      { header: "备注", key: "note", width: 20 },
    ];

    // Title row
    worksheet.mergeCells(1, 1, 1, 9);
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "日记表";
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.font = { size: 14, bold: true };

    // Header row style
    const headerRow = worksheet.getRow(2);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle" };
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    let balance = 0;
    let seq = 1;

    for (const t of transactions) {
      const amount = parseFloat(t.amount);
      const cat = t.categories as unknown as { name: string };
      const store = t.stores as unknown as { name: string } | null;

      if (t.type === "income") {
        balance += amount;
      } else {
        balance -= amount;
      }

      const dateStr = t.date.split("T")[0];
      const isIncome = t.type === "income";

      const rowData: Record<string, unknown> = {
        date: dateStr,
        seq: seq,
        store: store?.name || "",
        category: "",
        project: "",
        income: isIncome ? amount : "",
        expense: !isIncome ? amount : "",
        balance: balance,
        note: t.note || "",
      };

      const row = worksheet.addRow(rowData);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      const incomeCell = row.getCell("income");
      const expenseCell = row.getCell("expense");
      const balanceCell = row.getCell("balance");

      if (isIncome) {
        incomeCell.numFmt = "#,##0.00";
      } else {
        expenseCell.numFmt = "#,##0.00";
      }
      balanceCell.numFmt = "#,##0.00";

      seq++;
    }

    if (transactions.length === 0) {
      const row = worksheet.addRow({
        date: new Date().toISOString().split("T")[0],
        seq: "",
        category: "",
        project: "",
        income: "",
        expense: "",
        balance: 0,
        note: "",
      });
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const now = new Date();
    const fileName = `记账明细_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.xlsx`;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`
    );
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
