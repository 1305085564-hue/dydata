-- video_metrics_snapshots 缺少成员 DELETE 策略（013_videos_and_snapshots.sql 建表时只给了 SELECT/INSERT/UPDATE/管理员ALL）。
-- 缺策略时成员 delete() 静默返回 0 行不报错，导致提交失败时快照回滚实际不执行，造成孤儿快照。
-- 本 migration 补齐该策略，与 video_tags 的 20260727193000 保持相同模式：通过 videos 表判断归属。

drop policy if exists "员工删除自己视频的快照" on public.video_metrics_snapshots;

create policy "员工删除自己视频的快照"
  on public.video_metrics_snapshots
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.videos
      where videos.id = video_metrics_snapshots.video_id
        and videos.user_id = (select auth.uid())
    )
  );
