ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS guidance_method text
  CHECK (guidance_method IN ('oral', 'visual', 'profile', 'comment', 'other'));

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS profile_screenshot_paths text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS fixed_by_modification boolean DEFAULT NULL;

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS modification_count int DEFAULT NULL;

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS modification_note text DEFAULT NULL;

-- rollback reference:
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS modification_note;
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS modification_count;
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS fixed_by_modification;
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS profile_screenshot_paths;
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS guidance_method;
