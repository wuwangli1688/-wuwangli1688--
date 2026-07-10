import {
  pgTable,
  uuid,
  varchar,
  numeric,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 50 }).notNull(),
    icon: varchar("icon", { length: 50 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    color: varchar("color", { length: 20 }).default("#999999"),
    sortOrder: integer("sort_order").default(0),
    userId: uuid("user_id"),
  },
  (table) => [
    index("idx_categories_type").using("btree", table.type),
    index("idx_categories_user_id").using("btree", table.userId),
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    categoryId: uuid("category_id").notNull(),
    note: text("note"),
    date: timestamp("date", { mode: "string" }).notNull(),
    userId: uuid("user_id").notNull(),
    status: varchar("status", { length: 20 }).default("approved"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { mode: "string" }),
    createdAt: timestamp("created_at", { mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
  },
  (table) => [
    index("idx_transactions_type").using("btree", table.type),
    index("idx_transactions_category_id").using("btree", table.categoryId),
    index("idx_transactions_date").using("btree", table.date),
    index("idx_transactions_user_id").using("btree", table.userId),
    index("idx_transactions_status").using("btree", table.status),
  ]
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    role: varchar("role", { length: 20 }).notNull().default("parent"),
    parentUserId: uuid("parent_user_id"),
    displayName: varchar("display_name", { length: 100 }),
    createdAt: timestamp("created_at", { mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
  },
  (table) => [
    index("idx_user_profiles_parent").using("btree", table.parentUserId),
  ]
);

export type InsertCategory = typeof categories.$inferInsert;
export type SelectCategory = typeof categories.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type SelectTransaction = typeof transactions.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type SelectUserProfile = typeof userProfiles.$inferSelect;
