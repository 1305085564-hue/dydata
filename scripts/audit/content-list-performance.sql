-- Run only through content-list-performance.mjs, inside its rollback transaction.
CREATE TEMP TABLE perf_scope AS SELECT min(id::text)::uuid AS id FROM public.profiles;
DO $$ BEGIN IF (SELECT id FROM perf_scope) IS NULL THEN RAISE EXCEPTION 'existing local fixture profile required'; END IF; END $$;
INSERT INTO public.accounts(id, profile_id, name)
SELECT '7b550000-0000-4000-8000-000000000001', id, 'content-perf-fixture' FROM perf_scope;
INSERT INTO public.accounts(id, profile_id, name)
SELECT '7b550000-0000-4000-8000-000000000002', id, 'content-perf-midnight' FROM perf_scope;
INSERT INTO public.videos(id, account_id, user_id, video_title, published_at, lifecycle_state)
SELECT fixture.id::uuid, '7b550000-0000-4000-8000-000000000002', p.id, 'midnight fixture', fixture.published_at::timestamptz, 'active'
FROM perf_scope p CROSS JOIN (VALUES
 ('7b550000-0000-4000-8000-000000900001','2026-10-18 15:59:59+00'),
 ('7b550000-0000-4000-8000-000000900002','2026-10-18 16:00:00+00')
) fixture(id,published_at);
CREATE TEMP TABLE perf_videos AS
SELECT ('7b550000-0000-4000-8000-' || lpad((10000+n)::text,12,'0'))::uuid AS id, n,
  CASE WHEN n<=600 THEN '2026-10-18 12:00+08'::timestamptz + (n%60)*interval '1 minute'
    ELSE '2026-10-17 15:59+00'::timestamptz - (n%160)*interval '1 day' END AS published_at
FROM generate_series(1,2500) n;
INSERT INTO public.videos(id, account_id, user_id, video_title, content, published_at, lifecycle_state, anomaly_status)
SELECT v.id, '7b550000-0000-4000-8000-000000000001', p.id,
  CASE WHEN n%10=0 THEN 'literal%_\\' ELSE 'fixture' END || n,
  CASE WHEN n%5=0 THEN NULL ELSE 'fixture content' END, v.published_at,
  CASE WHEN n%19=0 THEN 'trashed' ELSE 'active' END,
  CASE WHEN n%7=0 THEN '限流' ELSE '正常' END
FROM perf_videos v CROSS JOIN perf_scope p;
INSERT INTO public.video_metrics_snapshots(video_id,snapshot_type,play_count,likes,comments,shares,favorites,follower_gain,bounce_rate_2s,completion_rate_5s,avg_play_duration,completion_rate,captured_at)
SELECT id,'24h',CASE WHEN n%17=0 THEN NULL ELSE (n%50)*1000 END, n%30,n%20,n%10,n%25,n%10,n%100,n%100,n%80,n%100,'2026-10-20 12:00+08'::timestamptz
FROM perf_videos WHERE n%13<>0;
INSERT INTO public.video_tags(video_id,tag_dimension,tag_value)
SELECT id,'话题',CASE WHEN n%3=0 THEN '干货' WHEN n%3=1 THEN '复盘' ELSE '其他' END FROM perf_videos;
INSERT INTO public.sub_topics(title,hook,created_by,source_video_id,library_status)
SELECT 'fixture','fixture',p.id,v.id,CASE WHEN n%2=0 THEN 'removed' ELSE 'in_library' END
FROM perf_videos v CROSS JOIN perf_scope p WHERE n%11=0;
INSERT INTO public.video_content_segments(video_id,segment_type,segment_text,segment_order,estimated_start_sec,estimated_end_sec)
SELECT id,'开头钩子','fixture',1,0,5 FROM perf_videos WHERE n%4=0;
-- A restored disposable database has no planner statistics. Analyze this identical fixture for both versions.
ANALYZE public.videos;
ANALYZE public.accounts;
ANALYZE public.profiles;
ANALYZE public.video_metrics_snapshots;
ANALYZE public.video_tags;
ANALYZE public.sub_topics;
ANALYZE public.video_content_segments;
CREATE TEMP TABLE perf_cases(name text, view_mode text default 'all', page_no int default 1, page_size int default 100, sort_field text default 'play_count', sort_dir text default 'desc', scope_ids uuid[], filters jsonb default '{}'::jsonb, cursor_value jsonb);
INSERT INTO perf_cases(name,scope_ids,filters)
SELECT name,ARRAY[p.id],jsonb_build_object('accountId','7b550000-0000-4000-8000-000000000001') || filters
FROM perf_scope p CROSS JOIN (VALUES
('default','{}'::jsonb),('day','{"startDate":"2026-10-18","endDate":"2026-10-18"}'),
('range','{"startDate":"2026-10-16","endDate":"2026-10-18"}'),
('literal-day','{"startDate":"2026-10-18","endDate":"2026-10-18","keyword":"literal"}'),
('midnight_before','{"accountId":"7b550000-0000-4000-8000-000000000002","startDate":"2026-10-18","endDate":"2026-10-18"}'),
('midnight_after','{"accountId":"7b550000-0000-4000-8000-000000000002","startDate":"2026-10-19","endDate":"2026-10-19"}'),
('midnight_latest','{"accountId":"7b550000-0000-4000-8000-000000000002"}'),
('empty','{"startDate":"2099-01-01"}'),('percent','{"keyword":"%"}'),('underscore','{"keyword":"_"}'),
('poor','{"qualityGrade":"poor"}'),('unrated','{"qualityGrade":"unrated"}'),('fair','{"qualityGrade":"fair"}'),
('good','{"qualityGrade":"good"}'),('excellent','{"qualityGrade":"excellent"}'),
('metrics','{"highlightOnly":true,"highlightRules":{"playCount":{"min":1000,"max":30000},"coreMetricRate":{"min":0}}}'),
('bucket','{"playBucket":"2w-5w"}'),('custom','{"playBucket":"custom","playMin":"1000","playMax":"10000"}'),
('library','{"topicStatus":"in_library"}'),('removed','{"topicStatus":"removed"}'),('anomaly','{"onlyAnomaly":true}'),
('user','{}')
) c(name,filters);
UPDATE perf_cases SET filters=filters || jsonb_build_object('userId',(SELECT id FROM perf_scope)) WHERE name='user';
INSERT INTO perf_cases(name,scope_ids,filters,sort_field,sort_dir,page_size)
SELECT 'sort_'||field||'_'||dir,ARRAY[p.id],jsonb_build_object('accountId','7b550000-0000-4000-8000-000000000001'),field,dir,size
FROM perf_scope p CROSS JOIN unnest(ARRAY['published_at','overall_grade','core_metric','play_count','follower_gain','likes','comments','shares','favorites','interaction_rate','bounce_rate_2s','completion_rate_5s','avg_play_duration','completion_rate']) field
CROSS JOIN unnest(ARRAY['asc','desc']) dir CROSS JOIN unnest(ARRAY[50,100,500]) size;
INSERT INTO perf_cases(name,scope_ids,filters,page_no) SELECT 'offset',scope_ids,filters,2 FROM perf_cases WHERE name='default';
INSERT INTO perf_cases(name,scope_ids,filters,cursor_value) SELECT 'cursor_next',scope_ids,filters,
  public.admin_content_list_page_baseline('all',1,100,NULL,'play_count','desc',scope_ids,filters)->'cursors'->'next' FROM perf_cases WHERE name='default';
INSERT INTO perf_cases(name,scope_ids,filters,cursor_value) SELECT 'cursor_stale',scope_ids,filters,'{"id":"00000000-0000-4000-8000-000000000000","sortValue":0}'::jsonb FROM perf_cases WHERE name='default';
INSERT INTO perf_cases(name,scope_ids,filters,view_mode) SELECT 'trash',scope_ids,filters,'trash' FROM perf_cases WHERE name='default';
INSERT INTO perf_cases(name,scope_ids,filters) SELECT 'empty_scope',ARRAY[]::uuid[],filters FROM perf_cases WHERE name='default';
CREATE TEMP TABLE perf_results(name text, before_body jsonb, after_body jsonb, before_ms numeric, after_ms numeric);
DO $$ DECLARE c record; b jsonb; a jsonb; t timestamptz; bm numeric; am numeric;
BEGIN
 FOR c IN SELECT * FROM perf_cases LOOP
  t=clock_timestamp(); b=public.admin_content_list_page_baseline(c.view_mode,c.page_no,c.page_size,c.cursor_value,c.sort_field,c.sort_dir,c.scope_ids,c.filters); bm=extract(epoch FROM clock_timestamp()-t)*1000;
  t=clock_timestamp(); a=public.admin_content_list_page(c.view_mode,c.page_no,c.page_size,c.cursor_value,c.sort_field,c.sort_dir,c.scope_ids,c.filters); am=extract(epoch FROM clock_timestamp()-t)*1000;
  IF (b-'diagnostics') IS DISTINCT FROM (a-'diagnostics') THEN RAISE EXCEPTION 'different results in case %',c.name; END IF;
  INSERT INTO perf_results VALUES(c.name,b,a,bm,am);
 END LOOP;
 IF EXISTS(SELECT 1 FROM perf_results WHERE name='empty_scope' AND after_body->'videos'<>'[]'::jsonb) THEN RAISE EXCEPTION 'empty scope leaked'; END IF;
 IF EXISTS(SELECT 1 FROM perf_results WHERE name IN ('midnight_before','midnight_after','midnight_latest') AND (
   jsonb_array_length(after_body->'videos')<>1 OR
   after_body#>>'{videos,0,id}' IS DISTINCT FROM CASE WHEN name='midnight_before' THEN '7b550000-0000-4000-8000-000000900001' ELSE '7b550000-0000-4000-8000-000000900002' END OR
   after_body->'availableDates' IS DISTINCT FROM '["2026-10-19","2026-10-18"]'::jsonb
 )) THEN RAISE EXCEPTION 'Shanghai midnight boundary incorrect'; END IF;
 IF (SELECT (after_body->'diagnostics'->>'rowsRead')::int >= (before_body->'diagnostics'->>'rowsRead')::int FROM perf_results WHERE name='day') THEN RAISE EXCEPTION 'historical enrichment was not reduced'; END IF;
 IF has_function_privilege('anon','public.admin_content_list_page(text,integer,integer,jsonb,text,text,uuid[],jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.admin_content_list_page(text,integer,integer,jsonb,text,text,uuid[],jsonb)','EXECUTE') THEN RAISE EXCEPTION 'RPC must remain service-role-only'; END IF;
END $$;
SELECT jsonb_build_object('matchingCases',count(*),'dayCandidateRowsBefore',(select before_body->'diagnostics'->'rowsRead' from perf_results where name='day'),'dayCandidateRowsAfter',(select after_body->'diagnostics'->'rowsRead' from perf_results where name='day')) FROM perf_results;
SELECT jsonb_build_object('case',name,'beforeMs',round(before_ms,2),'afterMs',round(after_ms,2)) FROM perf_results WHERE name IN ('day','default','range','empty','sort_play_count_desc');
