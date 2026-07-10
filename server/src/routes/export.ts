import { Router } from "express";
import type { Request, Response } from "express";
import ExcelJS from "exceljs";
import { getSupabaseClient } from "../storage/database/supabase-client.js";

const router = Router();

// GET /api/v1/export/transactions - 导出交易记录为 Excel
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;
    const client = getSupabaseClient();

    // 查询所有交易记录（按日期升序）
    let query = client
      .from("transactions")
      .select("id, amount, type, category_id, note, date, categories(name)")
      .order("date", { ascending: true });

    if (start_date) {
      query = query.gte("date", start_date as string);
    }
    if (end_date) {
      query = query.lte("date", end_date as string);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    const transactions = data || [];

    // 创建工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheet1");

    // 设置列宽
    worksheet.columns = [
      { header: "日期", key: "date", width: 14 },
      { header: "序号", key: "seq", width: 8 },
      { header: "分类", key: "category", width: 10 },
      { header: "项目", key: "project", width: 16 },
      { header: "收入", key: "income", width: 12 },
      { header: "支出", key: "expense", width: 12 },
      { header: "余额", key: "balance", width: 12 },
      { header: "备注", key: "note", width: 20 },
    ];

    // 设置标题行样式（合并单元格）
    worksheet.mergeCells(1, 1, 1, 8);
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "日记表";
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.font = { size: 14, bold: true };

    // 设置表头行样式
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

    // 计算余额并写入数据
    let balance = 0;
    let seq = 1;

    for (const t of transactions) {
      const amount = parseFloat(t.amount);
      const cat = t.categories as unknown as { name: string };

      if (t.type === "income") {
        balance += amount;
      } else {
        balance -= amount;
      }

      const dateStr = t.date.split("T")[0]; // YYYY-MM-DD
      const isIncome = t.type === "income";

      const rowData: Record<string, unknown> = {
        date: dateStr,
        seq: seq,
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

      // 设置数字格式
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

    // 如果没有数据，添加一行空行保持格式
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

    // 写入 buffer 并返回
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
