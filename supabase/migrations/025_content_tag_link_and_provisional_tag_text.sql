CREATE TABLE IF NOT EXISTS public.content_tag_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL,
  tag_id uuid REFERENCES public.tag_definition(id),
  tag_source text DEFAULT 'manual' CHECK (tag_source IN ('manual','ai','rule')),
  confidence_score numeric,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.content_tag_link ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.provisional_tag_text (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL,
  raw_text text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.provisional_tag_text ENABLE ROW LEVEL SECURITY;
