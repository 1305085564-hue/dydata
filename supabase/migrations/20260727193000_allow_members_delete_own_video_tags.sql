-- 视频提交会先删除旧标签再写入新标签；成员只能删除自己视频的标签。
drop policy if exists "员工删除自己视频的标签" on public.video_tags;

create policy "员工删除自己视频的标签"
  on public.video_tags
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.videos
      where videos.id = video_tags.video_id
        and videos.user_id = (select auth.uid())
    )
  );
