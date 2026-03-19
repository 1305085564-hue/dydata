alter table public.video_metrics_snapshots
  add column if not exists curve_pattern text,
  add column if not exists retention_analysis jsonb;
