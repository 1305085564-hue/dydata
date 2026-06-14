-- 一刻：领域增加颜色字段，用于卡片着色与领域分类标识
-- color 存预设 token（如 'orange'/'blue'）或自定义 hex；允许 null，取值由前端控制
alter table public.yike_areas
  add column if not exists color text;
