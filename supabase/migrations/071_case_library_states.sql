-- ============================================================
-- 071: 案例库状态维度拆分
-- ============================================================

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS usage_state text NOT NULL DEFAULT 'testing'
  CHECK (usage_state IN ('available', 'banned', 'testing', 'not_recommended'));

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS promotion_level text NOT NULL DEFAULT 'normal'
  CHECK (promotion_level IN ('promoted', 'normal', 'watching', 'deprecated'));

UPDATE public.violation_cases
SET usage_state = 'banned'
WHERE status = 'verified'
  AND is_violation = true;

UPDATE public.violation_cases
SET usage_state = 'available'
WHERE status = 'verified'
  AND is_violation = false;

ALTER TABLE public.script_usage_records
  ADD COLUMN IF NOT EXISTS result_flag text
  CHECK (result_flag IN ('pass', 'fail') OR result_flag IS NULL);

CREATE INDEX IF NOT EXISTS idx_violation_cases_public_lookup
  ON public.violation_cases (usage_state, promotion_level, status)
  WHERE is_deleted = false;

COMMENT ON COLUMN public.violation_cases.usage_state IS '使用状态：可用/禁用/待测试/不推荐';
COMMENT ON COLUMN public.violation_cases.promotion_level IS '推广等级：推荐/普通/观察/废弃';
COMMENT ON COLUMN public.script_usage_records.result_flag IS '使用结果标记：pass/fail/null';

-- rollback reference:
-- ALTER TABLE public.script_usage_records DROP COLUMN IF EXISTS result_flag;
-- DROP INDEX IF EXISTS public.idx_violation_cases_public_lookup;
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS promotion_level;
-- ALTER TABLE public.violation_cases DROP COLUMN IF EXISTS usage_state;
