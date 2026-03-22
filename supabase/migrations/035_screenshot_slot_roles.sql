-- 扩展 content_asset.asset_role 约束，支持新的截图槽位命名
ALTER TABLE public.content_asset DROP CONSTRAINT IF EXISTS content_asset_asset_role_check;
ALTER TABLE public.content_asset ADD CONSTRAINT content_asset_asset_role_check
  CHECK (asset_role IN ('overview','traffic_curve','retention_curve','engagement_extra','other','screenshot_1','screenshot_2','screenshot_3'));
