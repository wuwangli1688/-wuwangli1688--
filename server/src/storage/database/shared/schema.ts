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

// Stores (店铺) - owned by parent accounts
export const stores = pgTable(
  "stores",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    ownerId: uuid("owner_id").notNull(), // parent user id who owns this store
    createdAt: timestamp("created_at", { mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
  },
  (table) => [
    index("idx_stores_owner_id").using("btree", table.ownerId),
  ]
);

// Store permissions - which sub-accounts can access which stores
export const storePermissions = pgTable(
  "store_permissions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    storeId: uuid("store_id").notNull(),
    userId: uuid("user_id").notNull(), // sub-account user id
    grantedBy: uuid("granted_by").notNull(), // parent user id who granted
    createdAt: timestamp("created_at", { mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
  },
  (table) => [
    index("idx_store_permissions_store_id").using("btree", table.storeId),
    index("idx_store_permissions_user_id").using("btree", table.userId),
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
    storeId: uuid("store_id"), // which store this transaction belongs to
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
    index("idx_transactions_store_id").using("btree", table.storeId),
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
    platform: varchar("platform", { length: 20 }).default("app"),
    wxOpenid: varchar("wx_openid", { length: 100 }),
    wxUnionid: varchar("wx_unionid", { length: 100 }),
    wxNickname: varchar("wx_nickname", { length: 100 }),
    wxAvatarUrl: text("wx_avatar_url"),
    createdAt: timestamp("created_at", { mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
  },
  (table) => [
    index("idx_user_profiles_parent").using("btree", table.parentUserId),
    index("idx_user_profiles_wx_openid").using("btree", table.wxOpenid),
  ]
);

export type InsertCategory = typeof categories.$inferInsert;
export type SelectCategory = typeof categories.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type SelectTransaction = typeof transactions.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type SelectUserProfile = typeof userProfiles.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;
export type SelectStore = typeof stores.$inferSelect;
export type InsertStorePermission = typeof storePermissions.$inferInsert;
export type SelectStorePermission = typeof storePermissions.$inferSelect;
