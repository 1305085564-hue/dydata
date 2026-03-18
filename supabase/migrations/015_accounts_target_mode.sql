ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS target_mode text DEFAULT '起号' CHECK (target_mode IN ('起号','稳号','导粉'));
