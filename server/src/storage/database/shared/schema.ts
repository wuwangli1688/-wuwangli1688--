import { sql } from "drizzle-orm";
import { pgTable, serial, timestamp, varchar, text, numeric, integer, index } from "drizzle-orm/pg-core";

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 分类表
export const categories = pgTable(
  "categories",
  {
    id: serial().primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
    icon: varchar("icon", { length: 50 }).notNull(),
    type: varchar("type", { length: 10 }).notNull(), // 'income' | 'expense'
    color: varchar("color", { length: 20 }).notNull().default("#6C63FF"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("categories_type_idx").on(table.type),
    index("categories_sort_order_idx").on(table.sort_order),
  ]
);

// 交易记录表
export const transactions = pgTable(
  "transactions",
  {
    id: serial().primaryKey(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    type: varchar("type", { length: 10 }).notNull(), // 'income' | 'expense'
    category_id: integer("category_id").notNull().references(() => categories.id),
    note: text("note"),
    date: timestamp("date", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("transactions_category_id_idx").on(table.category_id),
    index("transactions_type_idx").on(table.type),
    index("transactions_date_idx").on(table.date),
    index("transactions_created_at_idx").on(table.created_at),
  ]
);
