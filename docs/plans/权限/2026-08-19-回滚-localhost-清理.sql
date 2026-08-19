begin;
update public.video_metrics_snapshots
set
  screenshot_urls = array[
    'http://localhost:3000/api/submission-screenshots/file?path=a689874f-12f1-43e1-8e20-87e2195fe041%2F2513b448-2c0b-48b2-b116-4ed031c90e75%2Fscreenshot_1%2F2026-07-27T10-50-16-665Z-d3321c6c-af88-4d7c-9a4c-e36449724936.jpg',
    'http://localhost:3000/api/submission-screenshots/file?path=a689874f-12f1-43e1-8e20-87e2195fe041%2F2513b448-2c0b-48b2-b116-4ed031c90e75%2Fscreenshot_2%2F2026-07-27T10-49-44-652Z-36c0fe6c-fd7c-47ce-b81f-4f8c7184e745.jpg'
  ]::text[],
  curve_screenshot_url = 'http://localhost:3000/api/submission-screenshots/file?path=a689874f-12f1-43e1-8e20-87e2195fe041%2F2513b448-2c0b-48b2-b116-4ed031c90e75%2Fscreenshot_2%2F2026-07-27T10-49-44-652Z-36c0fe6c-fd7c-47ce-b81f-4f8c7184e745.jpg',
  retention_screenshot_url = 'http://localhost:3000/api/submission-screenshots/file?path=a689874f-12f1-43e1-8e20-87e2195fe041%2F2513b448-2c0b-48b2-b116-4ed031c90e75%2Fscreenshot_2%2F2026-07-27T10-49-44-652Z-36c0fe6c-fd7c-47ce-b81f-4f8c7184e745.jpg'
where id = 'a5109cbc-904d-4fb9-955b-c5b8a9fb3c80';
select pg_notify('pgrst', 'reload schema');
commit;
