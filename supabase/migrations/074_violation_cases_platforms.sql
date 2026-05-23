-- ============================================================
-- 074: 转化向案例增加平台多选
-- platforms: 抖音/视频号/小红书/其他，默认 ['抖音']
-- ============================================================

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT ARRAY['抖音']::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'violation_cases_platforms_check'
  ) THEN
    ALTER TABLE public.violation_cases
      ADD CONSTRAINT violation_cases_platforms_check
      CHECK (
        array_length(platforms, 1) IS NULL
        OR (
          array_length(platforms, 1) >= 1
          AND array_length(platforms, 1) <= 4
          AND platforms <@ ARRAY['抖音', '视频号', '小红书', '其他']::text[]
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.violation_cases.platforms IS '案例发生的平台，多选：抖音/视频号/小红书/其他';

-- rollback reference:
-- ALTER TABLE public.violation_cases DROP CONSTRAINT IF EXISTS violation_cases_platforms_check;
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS platforms;
