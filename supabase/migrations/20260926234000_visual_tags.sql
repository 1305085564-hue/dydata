CREATE TABLE IF NOT EXISTS public.visual_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.violation_case_visual_tags (
  case_id uuid NOT NULL REFERENCES public.violation_cases(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.visual_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_vcvt_tag_id ON public.violation_case_visual_tags(tag_id);

ALTER TABLE public.visual_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violation_case_visual_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vt_select_all" ON public.visual_tags;
CREATE POLICY "vt_select_all" ON public.visual_tags
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "vcvt_select_all" ON public.violation_case_visual_tags;
CREATE POLICY "vcvt_select_all" ON public.violation_case_visual_tags
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_tags TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.violation_case_visual_tags TO authenticated, service_role;
