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
FROM public.rewrite_modes rm
UNION ALL
SELECT
  'rewrite_length_preset'::text AS config_type,
  rlp.id,
  rlp.key,
  rlp.name,
  rlp.length_prompt AS prompt,
  NULL::uuid AS channel_id,
  NULL::text AS model,
  NULL::uuid AS parent_id,
  jsonb_build_object('description', rlp.description, 'sort_order', rlp.sort_order, 'is_default', rlp.is_default) AS metadata,
  rlp.is_enabled,
  rlp.created_at,
  rlp.updated_at
FROM public.rewrite_length_presets rlp
UNION ALL
SELECT
  'rewrite_workflow'::text AS config_type,
  rw.id,
  rw.key,
  rw.name,
  rw.description AS prompt,
  NULL::uuid AS channel_id,
  NULL::text AS model,
  NULL::uuid AS parent_id,
  jsonb_build_object('sort_order', rw.sort_order, 'is_default', rw.is_default) AS metadata,
  rw.is_enabled,
  rw.created_at,
  rw.updated_at
FROM public.rewrite_workflows rw
UNION ALL
SELECT
  'rewrite_fixed_mode'::text AS config_type,
  rfm.id,
  rfm.key,
  rfm.name,
  rfm.fixed_prompt AS prompt,
  NULL::uuid AS channel_id,
  NULL::text AS model,
  rfm.model_view_id AS parent_id,
  jsonb_build_object('description', rfm.description, 'length_preset_id', rfm.length_preset_id, 'sort_order', rfm.sort_order) AS metadata,
  rfm.is_enabled,
  rfm.created_at,
  rfm.updated_at
FROM public.rewrite_fixed_modes rfm;

GRANT SELECT ON public.ai_unified_config_view TO authenticated, service_role;

-- rollback: DROP VIEW public.ai_unified_config_view;
