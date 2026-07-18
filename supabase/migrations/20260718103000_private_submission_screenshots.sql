-- 日报截图包含账号经营数据，禁止通过永久公开地址绕过应用层权限。
update storage.buckets
set public = false
where id = 'submission-screenshots';

-- 旧快照仍保存 Supabase 公开地址。切换私有桶时同步改为站内受保护读取地址，
-- 避免历史日报截图在部署后失效。
update public.video_metrics_snapshots as snapshot
set screenshot_urls = (
  select array_agg(
    case
      when item.url like '%/storage/v1/object/public/submission-screenshots/%'
        then 'https://dydata.cc/api/submission-screenshots/file?path='
          || split_part(item.url, '/storage/v1/object/public/submission-screenshots/', 2)
      else item.url
    end
    order by item.position
  ) as urls
  from unnest(snapshot.screenshot_urls) with ordinality as item(url, position)
)
where snapshot.screenshot_urls is not null
  and exists (
    select 1
    from unnest(snapshot.screenshot_urls) as existing_url
    where existing_url like '%/storage/v1/object/public/submission-screenshots/%'
  );

update public.video_metrics_snapshots
set curve_screenshot_url = 'https://dydata.cc/api/submission-screenshots/file?path='
  || split_part(curve_screenshot_url, '/storage/v1/object/public/submission-screenshots/', 2)
where curve_screenshot_url like '%/storage/v1/object/public/submission-screenshots/%';

update public.video_metrics_snapshots
set retention_screenshot_url = 'https://dydata.cc/api/submission-screenshots/file?path='
  || split_part(retention_screenshot_url, '/storage/v1/object/public/submission-screenshots/', 2)
where retention_screenshot_url like '%/storage/v1/object/public/submission-screenshots/%';
