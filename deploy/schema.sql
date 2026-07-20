-- ============================================
-- 收支记账本 - 数据库表结构（PostgreSQL）
-- 适用于 Supabase / 腾讯云 PostgreSQL
-- ============================================

-- 1. 用户信息表（与 Supabase Auth 关联）
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY,
  role VARCHAR(20) NOT NULL DEFAULT 'parent',
  parent_user_id UUID REFERENCES user_profiles(id),
  display_name VARCHAR(100),
  platform VARCHAR(20) DEFAULT 'app',
  wx_openid VARCHAR(100) UNIQUE,
  wx_unionid VARCHAR(100),
  wx_nickname VARCHAR(100),
  wx_avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  security_question TEXT,
  security_answer TEXT,
  role_title VARCHAR(50) DEFAULT '',
  permissions TEXT[] DEFAULT ARRAY['create', 'modify', 'delete'],
  needs_approval BOOLEAN DEFAULT true
);

-- 2. 分类表
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(50) NOT NULL,
  type VARCHAR(10) NOT NULL,
  color VARCHAR(20) DEFAULT '#6C63FF',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS categories_type_idx ON categories(type);
CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON categories(sort_order);

-- 3. 店铺表
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  owner_id UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- 4. 店铺权限表
CREATE TABLE IF NOT EXISTS store_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  role VARCHAR(20) NOT NULL DEFAULT 'editor',
  granted_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, user_id)
);

-- 5. 交易流水表
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  amount NUMERIC NOT NULL,
  type VARCHAR(10) NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  note TEXT,
  date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  user_id UUID NOT NULL DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  status VARCHAR(20) DEFAULT 'approved',
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  project TEXT,
  pending_edit_data JSONB
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
CREATE INDEX IF NOT EXISTS transactions_type_idx ON transactions(type);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON transactions(category_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);

-- 6. 反馈表
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  contact TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. App 版本表
CREATE TABLE IF NOT EXISTS app_versions (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  min_version TEXT,
  release_notes TEXT DEFAULT '',
  download_url TEXT DEFAULT '',
  force_update BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 健康检查表
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 旧版反馈表（兼容）
CREATE TABLE IF NOT EXISTS user_feedback (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  contact TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);