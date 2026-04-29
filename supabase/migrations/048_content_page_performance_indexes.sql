create index if not exists idx_videos_published_created
  on public.videos (published_at desc nulls last, created_at desc);

create index if not exists idx_video_metrics_snapshots_24h_captured_at
  on public.video_metrics_snapshots (captured_at desc, video_id)
  where snapshot_type = '24h';
