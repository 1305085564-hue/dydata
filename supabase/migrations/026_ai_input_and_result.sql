CREATE TABLE IF NOT EXISTS public.ai_input_bundle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_scope text NOT NULL
    CHECK (insight_scope IN ('single_video','member_week','member_month','team_week','team_month')),
  scope_entity_id uuid,
  input_version integer DEFAULT 1,
  data_quality_state text DEFAULT 'sufficient'
    CHECK (data_quality_state IN ('sufficient','partial','insufficient')),
  input_json jsonb NOT NULL,
  generated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_input_bundle ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_insight_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_bundle_id uuid REFERENCES public.ai_input_bundle(id),
  insight_type text NOT NULL CHECK (insight_type IN ('growth_edit','period_direction')),
  model_name text,
  prompt_version text,
  result_status text DEFAULT 'pending',
  result_json jsonb,
  rendered_text text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_insight_result ENABLE ROW LEVEL SECURITY;
