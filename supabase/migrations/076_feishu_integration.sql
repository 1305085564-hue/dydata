-- 076 飞书集成：profiles 表新增飞书字段
-- 用于 SSO 免登匹配 + 机器人双向交互

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS feishu_open_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS feishu_union_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_feishu_open_id
  ON profiles (feishu_open_id);
