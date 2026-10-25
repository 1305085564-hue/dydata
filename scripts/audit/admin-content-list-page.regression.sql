-- Reproducible local regression for admin_content_list_page.
-- Run by streaming: baseline function definition/ACL fingerprints + BEGIN + migration SQL + this file
-- into psql with ON_ERROR_STOP=1. The final ROLLBACK restores the function and all seeds.

\set ON_ERROR_STOP on
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    RAISE EXCEPTION 'local regression requires an existing profile for the fixture account';
  END IF;
END $$;
SELECT min(id::text) AS audit_fixture_profile_id FROM public.profiles \gset
SET LOCAL TIME ZONE 'UTC';

CREATE TEMP TABLE _admin_content_audit_videos (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  published_at timestamptz,
  play_count bigint,
  snapshot_id uuid
) ON COMMIT DROP;

INSERT INTO _admin_content_audit_videos (id, title, published_at, play_count, snapshot_id) VALUES
  ('7a440000-0000-4000-8000-000000000010', 'audit-boundary-15' || chr(92) || '59z', '2026-10-15 15:59:00+00', 7000, '7a440000-0000-4000-9000-000000000501'),
  ('7a440000-0000-4000-8000-000000000011', 'audit-boundary-16_00z', '2026-10-15 16:00:00+00', 7100, '7a440000-0000-4000-9000-000000000502'),
  ('7a440000-0000-4000-8000-000000000012', 'audit-boundary-16%00plus08', '2026-10-16 00:00:00+08', 7200, '7a440000-0000-4000-9000-000000000503'),
  ('7a440000-0000-4000-8000-000000000020', 'audit-rating-0', '2026-10-18 12:00:00+08', 0, '7a440000-0000-4000-9000-000000000510'),
  ('7a440000-0000-4000-8000-000000000021', 'audit-rating-1999', '2026-10-18 12:00:00+08', 1999, '7a440000-0000-4000-9000-000000000511'),
  ('7a440000-0000-4000-8000-000000000022', 'audit-rating-2000', '2026-10-18 12:00:00+08', 2000, '7a440000-0000-4000-9000-000000000512'),
  ('7a440000-0000-4000-8000-000000000023', 'audit-rating-4999', '2026-10-18 12:00:00+08', 4999, '7a440000-0000-4000-9000-000000000513'),
  ('7a440000-0000-4000-8000-000000000024', 'audit-rating-5000', '2026-10-18 12:00:00+08', 5000, '7a440000-0000-4000-9000-000000000514'),
  ('7a440000-0000-4000-8000-000000000025', 'audit-rating-null-play', '2026-10-18 12:00:00+08', NULL, '7a440000-0000-4000-9000-000000000515'),
  ('7a440000-0000-4000-8000-000000000026', 'audit-rating-no-24h', '2026-10-18 12:00:00+08', NULL, NULL);

INSERT INTO _admin_content_audit_videos (id, title, published_at, play_count, snapshot_id)
SELECT
  ('7a440000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid,
  'audit-rating-sort-' || lpad(n::text, 2, '0'),
  '2026-10-18 12:00:00+08'::timestamptz,
  6000 + n,
  ('7a440000-0000-4000-9000-' || lpad((610 + n)::text, 12, '0'))::uuid
FROM generate_series(0, 15) AS n;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = '7a440000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'audit fixture account ID already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.videos v JOIN _admin_content_audit_videos f ON f.id = v.id) THEN
    RAISE EXCEPTION 'one or more audit fixture video IDs already exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.video_metrics_snapshots s
    JOIN _admin_content_audit_videos f ON f.snapshot_id = s.id
    WHERE f.snapshot_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'one or more audit fixture snapshot IDs already exist';
  END IF;
END $$;

INSERT INTO public.accounts (id, profile_id, name)
VALUES (
  '7a440000-0000-4000-8000-000000000002',
  :'audit_fixture_profile_id'::uuid,
  'admin-content-audit-fixture'
);

INSERT INTO public.videos (id, account_id, user_id, video_title, published_at, lifecycle_state)
SELECT
  id,
  '7a440000-0000-4000-8000-000000000002',
  :'audit_fixture_profile_id'::uuid,
  title,
  published_at,
  'active'
FROM _admin_content_audit_videos;

INSERT INTO public.video_metrics_snapshots (
  id, video_id, snapshot_type, play_count, likes, comments, shares, favorites, captured_at
)
SELECT
  f.snapshot_id,
  f.id,
  '24h',
  f.play_count,
  CASE WHEN f.play_count > 0 THEN floor(f.play_count * 0.02)::integer ELSE 0 END,
  CASE WHEN f.play_count > 0 THEN floor(f.play_count * 0.015)::integer ELSE 0 END,
  0,
  0,
  '2026-10-19 12:00:00+08'::timestamptz
FROM _admin_content_audit_videos f
WHERE f.snapshot_id IS NOT NULL;

CREATE TEMP TABLE _admin_content_audit_results (
  case_name text PRIMARY KEY,
  body jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _admin_content_audit_results
SELECT 'default_latest_day', public.admin_content_list_page(
  'active', 1, 20, NULL, 'play_count', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid], '{"accountId":"7a440000-0000-4000-8000-000000000002"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'date_15', public.admin_content_list_page(
  'active', 1, 20, NULL, 'published_at', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-15","endDate":"2026-10-15"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'date_16', public.admin_content_list_page(
  'active', 1, 20, NULL, 'published_at', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-16","endDate":"2026-10-16"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'keyword_boundary_16', public.admin_content_list_page(
  'active', 1, 20, NULL, 'published_at', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","keyword":"audit-boundary-16"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'literal_percent', public.admin_content_list_page(
  'active', 1, 20, NULL, 'published_at', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  jsonb_build_object('accountId', '7a440000-0000-4000-8000-000000000002', 'keyword', '%')
);

INSERT INTO _admin_content_audit_results
SELECT 'literal_underscore', public.admin_content_list_page(
  'active', 1, 20, NULL, 'published_at', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  jsonb_build_object('accountId', '7a440000-0000-4000-8000-000000000002', 'keyword', '_')
);

INSERT INTO _admin_content_audit_results
SELECT 'literal_backslash', public.admin_content_list_page(
  'active', 1, 20, NULL, 'published_at', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  jsonb_build_object('accountId', '7a440000-0000-4000-8000-000000000002', 'keyword', chr(92))
);

INSERT INTO _admin_content_audit_results
SELECT 'grade_poor', public.admin_content_list_page(
  'active', 1, 20, NULL, 'play_count', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-18","endDate":"2026-10-18","qualityGrade":"poor"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'grade_fair', public.admin_content_list_page(
  'active', 1, 20, NULL, 'play_count', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-18","endDate":"2026-10-18","qualityGrade":"fair"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'grade_unrated', public.admin_content_list_page(
  'active', 1, 20, NULL, 'play_count', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-18","endDate":"2026-10-18","qualityGrade":"unrated"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'rating_page_1', public.admin_content_list_page(
  'active', 1, 20, NULL, 'play_count', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-18","endDate":"2026-10-18"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'rating_page_2_offset', public.admin_content_list_page(
  'active', 2, 20, NULL, 'play_count', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-18","endDate":"2026-10-18"}'::jsonb
);

INSERT INTO _admin_content_audit_results
SELECT 'rating_page_2_cursor', public.admin_content_list_page(
  'active', 1, 20,
  (SELECT body->'cursors'->'next' FROM _admin_content_audit_results WHERE case_name = 'rating_page_1'),
  'play_count', 'desc',
  ARRAY[:'audit_fixture_profile_id'::uuid],
  '{"accountId":"7a440000-0000-4000-8000-000000000002","startDate":"2026-10-18","endDate":"2026-10-18"}'::jsonb
);

CREATE TEMP TABLE _admin_content_audit_checks (
  check_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

INSERT INTO _admin_content_audit_checks VALUES
('latest Shanghai date defaults to 2026-10-18 (23 rows)',
  (SELECT body->'summary'->>'totalVideos' = '23' FROM _admin_content_audit_results WHERE case_name = 'default_latest_day'),
  'expected totalVideos=23 for Shanghai 2026-10-18'),
('15:59Z belongs to Shanghai Oct 15',
  (SELECT body->'summary'->>'totalVideos' = '1'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000010')
   FROM _admin_content_audit_results WHERE case_name = 'date_15'),
  'expected only video 000010'),
('16:00Z and equivalent +08 instant belong to Shanghai Oct 16',
  (SELECT body->'summary'->>'totalVideos' = '2'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000011')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000012')
    AND (SELECT count(DISTINCT v->>'published_at') = 1 FROM jsonb_array_elements(body->'videos') v)
   FROM _admin_content_audit_results WHERE case_name = 'date_16'),
  'expected two videos with identical serialized published_at instants'),
('date filters keep availableDates and availableCounts aligned',
  (SELECT body->'availableDates' = '["2026-10-18","2026-10-16","2026-10-15"]'::jsonb
    AND body->'availableCounts' = '[{"d":"2026-10-18","c":23},{"d":"2026-10-16","c":2},{"d":"2026-10-15","c":1}]'::jsonb
    AND (SELECT jsonb_agg(item->'d' ORDER BY ord) = body->'availableDates'
         FROM jsonb_array_elements(body->'availableCounts') WITH ORDINALITY AS x(item, ord))
   FROM _admin_content_audit_results WHERE case_name = 'date_16'),
  'expected Shanghai dates 18/16/15 with counts 23/2/1'),
('keyword filter scopes availableDates and counts consistently',
  (SELECT body->'summary'->>'totalVideos' = '2'
    AND body->'availableDates' = '["2026-10-16"]'::jsonb
    AND body->'availableCounts' = '[{"d":"2026-10-16","c":2}]'::jsonb
   FROM _admin_content_audit_results WHERE case_name = 'keyword_boundary_16'),
  'expected keyword match to include only two Oct 16 videos'),
('percent is searched as a literal character',
  (SELECT body->'summary'->>'totalVideos' = '1'
    AND body->'availableDates' = '["2026-10-16"]'::jsonb
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000012')
   FROM _admin_content_audit_results WHERE case_name = 'literal_percent'),
  'expected only video 000012, whose title contains literal percent'),
('underscore is searched as a literal character',
  (SELECT body->'summary'->>'totalVideos' = '1'
    AND body->'availableDates' = '["2026-10-16"]'::jsonb
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000011')
   FROM _admin_content_audit_results WHERE case_name = 'literal_underscore'),
  'expected only video 000011, whose title contains literal underscore'),
('backslash is searched as a literal character',
  (SELECT body->'summary'->>'totalVideos' = '1'
    AND body->'availableDates' = '["2026-10-15"]'::jsonb
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000010')
   FROM _admin_content_audit_results WHERE case_name = 'literal_backslash'),
  'expected only video 000010, whose title contains literal backslash'),
('5000 floor marks 0/1999/2000/4999 as poor',
  (SELECT body->'summary'->>'totalVideos' = '4'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000020')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000021')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000022')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000023')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000024')
   FROM _admin_content_audit_results WHERE case_name = 'grade_poor'),
  'expected 4 poor rows: 0, 1999, 2000, 4999; 5000 excluded'),
('5000 and above playable rows remain fair',
  (SELECT body->'summary'->>'totalVideos' = '17'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000024')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' IN (
      '7a440000-0000-4000-8000-000000000020', '7a440000-0000-4000-8000-000000000021',
      '7a440000-0000-4000-8000-000000000022', '7a440000-0000-4000-8000-000000000023'))
   FROM _admin_content_audit_results WHERE case_name = 'grade_fair'),
  'expected fair rows: play_count 5000 plus sixteen 6000-6015 rows'),
('null play count and missing 24h snapshot remain unrated',
  (SELECT body->'summary'->>'totalVideos' = '2'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000025')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(body->'videos') v WHERE v->>'id' = '7a440000-0000-4000-8000-000000000026')
    AND jsonb_array_length(body->'snapshots') = 1
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(body->'snapshots') s WHERE s->>'video_id' = '7a440000-0000-4000-8000-000000000026')
   FROM _admin_content_audit_results WHERE case_name = 'grade_unrated'),
  'expected two unrated rows; only the null-play row has a 24h snapshot'),
('play-count sort is descending and page 1 is full',
  (SELECT jsonb_array_length(body->'videos') = 20
    AND body->'videos'->0->>'id' = '7a440000-0000-4000-8000-000000000115'
    AND body->'videos'->15->>'id' = '7a440000-0000-4000-8000-000000000100'
    AND body->'videos'->16->>'id' = '7a440000-0000-4000-8000-000000000024'
    AND body->'videos'->17->>'id' = '7a440000-0000-4000-8000-000000000023'
    AND body->'videos'->18->>'id' = '7a440000-0000-4000-8000-000000000022'
    AND body->'videos'->19->>'id' = '7a440000-0000-4000-8000-000000000021'
    AND body->'summary'->>'totalPages' = '2'
    AND body->'summary'->>'hasNextPage' = 'true'
   FROM _admin_content_audit_results WHERE case_name = 'rating_page_1'),
  'expected descending 6015..6000, 5000, 4999, 2000, 1999 on page 1'),
('offset and cursor pagination return the same remaining three rows',
  (SELECT jsonb_array_length(off.body->'videos') = 3
    AND off.body->'videos'->0->>'id' = '7a440000-0000-4000-8000-000000000020'
    AND off.body->'videos' = cur.body->'videos'
   FROM _admin_content_audit_results off
   JOIN _admin_content_audit_results cur ON cur.case_name = 'rating_page_2_cursor'
   WHERE off.case_name = 'rating_page_2_offset'),
  'expected page 2 = zero-play and two null-sort rows, identical by offset or cursor');

INSERT INTO _admin_content_audit_checks VALUES
('admin RPC remains service_role-only',
  has_function_privilege('service_role', 'public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure, 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = 'public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure
      AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ),
  'expected execute grant only for service_role; public, anon and authenticated denied');

SELECT bool_and(passed)::text AS admin_content_audit_passed FROM _admin_content_audit_checks \gset
TABLE _admin_content_audit_checks;

ROLLBACK;

SELECT :'baseline_fn_md5' AS baseline_function_fingerprint,
  md5(pg_get_functiondef('public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure)) AS restored_function_fingerprint;

SELECT (md5(pg_get_functiondef('public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure)) = :'baseline_fn_md5')::text AS function_definition_restored \gset
\if :function_definition_restored
  \echo PASS function definition restored after rollback
\else
  \echo FAIL function definition changed after rollback
  DO $$ BEGIN RAISE EXCEPTION 'function definition changed after rollback'; END $$;
\endif

SELECT (md5(coalesce(p.proacl::text, '<NULL>') || ':' || p.proowner::text) = :'baseline_fn_acl_md5')::text AS function_acl_restored
FROM pg_proc p
WHERE p.oid = 'public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure
\gset
\if :function_acl_restored
  \echo PASS function permissions restored after rollback
\else
  \echo FAIL function permissions changed after rollback
  DO $$ BEGIN RAISE EXCEPTION 'function permissions changed after rollback'; END $$;
\endif

WITH expected_video_ids(id) AS (
  SELECT unnest(ARRAY[
    '7a440000-0000-4000-8000-000000000010', '7a440000-0000-4000-8000-000000000011',
    '7a440000-0000-4000-8000-000000000012', '7a440000-0000-4000-8000-000000000020',
    '7a440000-0000-4000-8000-000000000021', '7a440000-0000-4000-8000-000000000022',
    '7a440000-0000-4000-8000-000000000023', '7a440000-0000-4000-8000-000000000024',
    '7a440000-0000-4000-8000-000000000025', '7a440000-0000-4000-8000-000000000026'
  ]::uuid[])
  UNION ALL
  SELECT ('7a440000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid
  FROM generate_series(0, 15) AS n
), expected_snapshot_ids(id) AS (
  SELECT unnest(ARRAY[
    '7a440000-0000-4000-9000-000000000501', '7a440000-0000-4000-9000-000000000502',
    '7a440000-0000-4000-9000-000000000503', '7a440000-0000-4000-9000-000000000510',
    '7a440000-0000-4000-9000-000000000511', '7a440000-0000-4000-9000-000000000512',
    '7a440000-0000-4000-9000-000000000513', '7a440000-0000-4000-9000-000000000514',
    '7a440000-0000-4000-9000-000000000515'
  ]::uuid[])
  UNION ALL
  SELECT ('7a440000-0000-4000-9000-' || lpad((610 + n)::text, 12, '0'))::uuid
  FROM generate_series(0, 15) AS n
)
SELECT (
  NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = '7a440000-0000-4000-8000-000000000002')
  AND NOT EXISTS (SELECT 1 FROM public.videos WHERE id IN (SELECT id FROM expected_video_ids))
  AND NOT EXISTS (SELECT 1 FROM public.video_metrics_snapshots WHERE id IN (SELECT id FROM expected_snapshot_ids))
  )::text AS fixture_rows_rolled_back \gset
\if :fixture_rows_rolled_back
  \echo PASS fixture rows rolled back
\else
  \echo FAIL fixture rows remain after rollback
  DO $$ BEGIN RAISE EXCEPTION 'fixture rows remain after rollback'; END $$;
\endif

\if :admin_content_audit_passed
  \echo PASS admin_content_list_page regression
\else
  \echo FAIL admin_content_list_page regression
  DO $$ BEGIN RAISE EXCEPTION 'admin_content_list_page regression failed'; END $$;
\endif
