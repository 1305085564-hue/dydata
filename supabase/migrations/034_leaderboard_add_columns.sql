-- 034: extend get_leaderboard_rows with comments, shares, favorites, follower_convert

CREATE OR REPLACE FUNCTION public.get_leaderboard_rows(
  since_date date DEFAULT (CURRENT_DATE - INTERVAL '29 day')::date
)
RETURNS TABLE (
  account_id uuid,
  account_name text,
  profile_id uuid,
  owner_name text,
  content_direction text,
  presentation_format text,
  report_date date,
  play_count bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  favorites bigint,
  follower_gain bigint,
  follower_convert bigint,
  completion_rate text,
  avg_play_duration text,
  bounce_rate_2s text,
  completion_rate_5s text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.account_id,
    a.name AS account_name,
    a.profile_id,
    p.name AS owner_name,
    a.content_direction,
    a.presentation_format,
    dr.report_date,
    dr.play_count,
    dr.likes,
    dr.comments,
    dr.shares,
    dr.favorites,
    dr.follower_gain,
    dr.follower_convert,
    dr.completion_rate,
    dr.avg_play_duration,
    dr.bounce_rate_2s,
    dr.completion_rate_5s
  FROM public.daily_reports dr
  JOIN public.accounts a ON a.id = dr.account_id
  JOIN public.profiles p ON p.id = a.profile_id
  WHERE auth.uid() IS NOT NULL
    AND dr.report_date >= since_date
  ORDER BY dr.report_date DESC, dr.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_rows(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_rows(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_rows(date) TO service_role;
