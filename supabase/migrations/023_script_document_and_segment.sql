CREATE TABLE IF NOT EXISTS public.script_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL,
  raw_text text,
  structured_version integer DEFAULT 1,
  word_count integer,
  estimated_duration_sec integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.script_document ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.script_segment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_document_id uuid REFERENCES public.script_document(id),
  segment_type text NOT NULL
    CHECK (segment_type IN ('hook','background','core_point','action_cta','closing')),
  segment_order integer,
  content text,
  start_sec integer,
  end_sec integer,
  mapping_status text DEFAULT 'unmapped'
    CHECK (mapping_status IN ('unmapped','estimated','confirmed'))
);

ALTER TABLE public.script_segment ENABLE ROW LEVEL SECURITY;
