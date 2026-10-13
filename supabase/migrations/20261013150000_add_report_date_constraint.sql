-- report_date must match the Shanghai calendar date of published_at.
-- Rows without published_at remain compatible with historical manual reports.
ALTER TABLE public.daily_reports
ADD CONSTRAINT report_date_must_match_published_at
CHECK (
  published_at IS NULL
  OR report_date = (published_at AT TIME ZONE 'Asia/Shanghai')::date
) NOT VALID;

ALTER TABLE public.daily_reports
VALIDATE CONSTRAINT report_date_must_match_published_at;

COMMENT ON CONSTRAINT report_date_must_match_published_at ON public.daily_reports IS
'report_date must equal the Shanghai calendar date of published_at; rows without published_at are exempt';
