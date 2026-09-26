-- ============================================================
-- 062: AI unified config view
-- ============================================================

CREATE OR REPLACE VIEW public.ai_unified_config_view AS
SELECT
  'feature'::text AS config_type,
  afc.id,
  afc.feature_key AS key,
  afc.label AS name,
  afc.system_prompt AS prompt,
  afc.channel_id,
  afc.model,
  NULL::uuid AS parent_id,
  NULL::jsonb AS metadata,
  afc.is_enabled,
  afc.created_at,
  afc.updated_at
FROM public.ai_feature_config afc
UNION ALL
SELECT
  'rewrite_model_view'::text AS config_type,
  rmv.id,
  rmv.key,
  rmv.label AS name,
  rmv.description AS prompt,
  NULL::uuid AS channel_id,
  NULL::text AS model,
  NULL::uuid AS parent_id,
  jsonb_build_object('sort_order', rmv.sort_order, 'is_default', rmv.is_default) AS metadata,
  rmv.is_enabled,
  rmv.created_at,
  rmv.updated_at
FROM public.rewrite_model_views rmv
UNION ALL
SELECT
  'rewrite_mode'::text AS config_type,
  rm.id,
  rm.key,
  rm.name,
  rm.mode_prompt AS prompt,
  NULL::uuid AS channel_id,
  NULL::text AS model,
  NULL::uuid AS parent_id,
  jsonb_build_object('description', rm.description, 'sort_order', rm.sort_order, 'is_default', rm.is_default) AS metadata,
  rm.is_enabled,
  rm.created_at,
  rm.updated_at
FROM public.rewrite_modes rm;

GRANT SELECT ON public.ai_unified_config_view TO authenticated, service_role;

-- rollback: DROP VIEW public.ai_unified_config_view;
