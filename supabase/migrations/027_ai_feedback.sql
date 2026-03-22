CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_result_id uuid REFERENCES public.ai_insight_result(id),
  user_id uuid REFERENCES auth.users(id),
  feedback_type text CHECK (feedback_type IN ('helpful','not_helpful','adopted','rejected')),
  feedback_text text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
