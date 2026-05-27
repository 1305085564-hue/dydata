UPDATE profiles
SET permissions = jsonb_build_object(
  'view_all_data', true,
  'edit_data', true,
  'export_data', true,
  'view_analytics', true,
  'manage_members', true,
  'manage_violations', true,
  'view_conversion_hub', true,
  'view_content_review', true,
  'manage_video_assets', true,
  'use_ai_copywriting', true,
  'use_ai_management', true
)
WHERE role = 'admin';
