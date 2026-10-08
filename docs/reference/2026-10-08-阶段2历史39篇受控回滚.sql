-- 阶段 2 历史 39 篇纯独立错位数据受控回滚脚本
-- 执行批次：Batch-20261008-Stage2-History39
-- 执行保护：逐条校验 id + 当前 report_date 是否仍等于平移后的目标日期，若出现任何一行状态漂移，抛出异常终止并整事务回滚。

DO $$
DECLARE
  v_count int;
BEGIN
  -- 1. 预检：核验当前生产库中符合预期条件的行数是否恰好为 39 行
  SELECT count(*) INTO v_count
  FROM public.daily_reports
  WHERE (id, report_date) IN (
    ('05809d96-8292-4540-9452-39bef36329d2'::uuid, '2026-04-08'::date),
    ('06b87480-1c37-422d-bc8d-4435a4c8febf'::uuid, '2026-04-11'::date),
    ('13507dd9-4576-4d02-b772-993c71bbe29a'::uuid, '2026-04-25'::date),
    ('1b2b25dc-af95-48da-b9fe-34d22891c22c'::uuid, '2026-04-13'::date),
    ('20893abf-970e-4767-9212-502f289b236f'::uuid, '2026-03-21'::date),
    ('23b29fc6-b111-4620-bfab-96721a20a9bf'::uuid, '2026-08-15'::date),
    ('31ccb5e9-666f-4e66-a014-aced2217fc82'::uuid, '2026-03-24'::date),
    ('33c2d394-f4c8-45ef-99f4-9fcc42652f47'::uuid, '2026-08-22'::date),
    ('351e3704-9cbf-4788-a326-88ac2db89c6d'::uuid, '2026-04-18'::date),
    ('393d3c0d-c300-498c-9d05-172380e56740'::uuid, '2026-05-20'::date),
    ('42df52e8-4bed-44d2-87f4-03cf41cb5d3b'::uuid, '2026-08-29'::date),
    ('49e67805-0433-41b0-abc7-6b203411fcec'::uuid, '2026-03-20'::date),
    ('4a6f0d43-b232-4428-92b8-b9d68702652e'::uuid, '2026-04-11'::date),
    ('70392432-9282-4f7a-8243-ef83f6c7ff46'::uuid, '2026-07-26'::date),
    ('7158af16-3f61-4862-80bf-b0e4bd93578c'::uuid, '2026-08-08'::date),
    ('72fe0728-b082-4636-bc5e-275c5f1bf2c0'::uuid, '2026-03-21'::date),
    ('765e22d9-350b-4afa-847a-e2a1afe9dc8b'::uuid, '2026-04-18'::date),
    ('7a0b9cba-c49e-4436-858c-dc0f28c42934'::uuid, '2026-04-10'::date),
    ('8130183c-7dd0-4b53-8d1c-0705890661e3'::uuid, '2026-08-01'::date),
    ('8277b91a-60f4-4cdd-ae55-39ee0212dcc2'::uuid, '2026-03-28'::date),
    ('849a9555-b4b9-4573-a2fe-8e49c095db42'::uuid, '2026-03-30'::date),
    ('84fb151e-dd8d-4516-931f-63485d0a02fe'::uuid, '2026-05-28'::date),
    ('8641a5ab-0020-4f0a-8553-295e873518f1'::uuid, '2026-08-08'::date),
    ('8eae7ca9-c927-4a77-95f4-6ce205520bfc'::uuid, '2026-09-04'::date),
    ('a069ec22-300f-480f-b33d-82ddc640cd04'::uuid, '2026-04-11'::date),
    ('a5298cb3-a8d9-4e4b-b55e-87e10d1da8b8'::uuid, '2026-08-18'::date),
    ('a794ede1-336a-42a9-8eec-eb874042557b'::uuid, '2026-08-15'::date),
    ('aea16f83-67aa-4cdb-a377-8e6f734c8ff5'::uuid, '2026-06-05'::date),
    ('bdef2385-adac-4b83-9282-6fba603a4dbd'::uuid, '2026-03-28'::date),
    ('c7fd03ec-49c8-439b-9448-0c762c9e6ebd'::uuid, '2026-08-29'::date),
    ('d173d7d9-2c8e-43c5-82f1-92da13fecd6b'::uuid, '2026-08-15'::date),
    ('d40b48a6-5b4a-4278-b206-dc009f42fa9c'::uuid, '2026-04-18'::date),
    ('d6389649-3fcb-4551-b37e-93392afac97a'::uuid, '2026-03-21'::date),
    ('d68506e0-ec83-4c5d-bfd9-3d2e9291fc08'::uuid, '2026-06-08'::date),
    ('dcba2089-906d-43c6-8040-a8e6ced7eb82'::uuid, '2026-08-22'::date),
    ('e405d7a8-8894-4274-a575-9727639ef4c3'::uuid, '2026-03-31'::date),
    ('e6c3a9f2-607d-4feb-b5b7-1f436a83582d'::uuid, '2026-08-06'::date),
    ('ef55574f-d38d-4957-9697-9d89c58f6804'::uuid, '2026-04-02'::date),
    ('f772d348-0c66-443f-8c15-75eca16d12df'::uuid, '2026-04-10'::date)
  );

  IF v_count <> 39 THEN
    RAISE EXCEPTION '安全保护触发：预期 39 条记录中存在状态漂移（实际匹配 % 条），拒绝执行回滚！', v_count;
  END IF;

  -- 2. 逐条安全回滚至原始 report_date
  UPDATE public.daily_reports SET report_date = '2026-04-10' WHERE id = '05809d96-8292-4540-9452-39bef36329d2' AND report_date = '2026-04-08';
  UPDATE public.daily_reports SET report_date = '2026-04-13' WHERE id = '06b87480-1c37-422d-bc8d-4435a4c8febf' AND report_date = '2026-04-11';
  UPDATE public.daily_reports SET report_date = '2026-04-27' WHERE id = '13507dd9-4576-4d02-b772-993c71bbe29a' AND report_date = '2026-04-25';
  UPDATE public.daily_reports SET report_date = '2026-04-11' WHERE id = '1b2b25dc-af95-48da-b9fe-34d22891c22c' AND report_date = '2026-04-13';
  UPDATE public.daily_reports SET report_date = '2026-03-27' WHERE id = '20893abf-970e-4767-9212-502f289b236f' AND report_date = '2026-03-21';
  UPDATE public.daily_reports SET report_date = '2026-08-17' WHERE id = '23b29fc6-b111-4620-bfab-96721a20a9bf' AND report_date = '2026-08-15';
  UPDATE public.daily_reports SET report_date = '2026-03-26' WHERE id = '31ccb5e9-666f-4e66-a014-aced2217fc82' AND report_date = '2026-03-24';
  UPDATE public.daily_reports SET report_date = '2026-08-24' WHERE id = '33c2d394-f4c8-45ef-99f4-9fcc42652f47' AND report_date = '2026-08-22';
  UPDATE public.daily_reports SET report_date = '2026-04-20' WHERE id = '351e3704-9cbf-4788-a326-88ac2db89c6d' AND report_date = '2026-04-18';
  UPDATE public.daily_reports SET report_date = '2026-05-14' WHERE id = '393d3c0d-c300-498c-9d05-172380e56740' AND report_date = '2026-05-20';
  UPDATE public.daily_reports SET report_date = '2026-08-31' WHERE id = '42df52e8-4bed-44d2-87f4-03cf41cb5d3b' AND report_date = '2026-08-29';
  UPDATE public.daily_reports SET report_date = '2026-03-25' WHERE id = '49e67805-0433-41b0-abc7-6b203411fcec' AND report_date = '2026-03-20';
  UPDATE public.daily_reports SET report_date = '2026-04-13' WHERE id = '4a6f0d43-b232-4428-92b8-b9d68702652e' AND report_date = '2026-04-11';
  UPDATE public.daily_reports SET report_date = '2026-07-01' WHERE id = '70392432-9282-4f7a-8243-ef83f6c7ff46' AND report_date = '2026-07-26';
  UPDATE public.daily_reports SET report_date = '2026-08-10' WHERE id = '7158af16-3f61-4862-80bf-b0e4bd93578c' AND report_date = '2026-08-08';
  UPDATE public.daily_reports SET report_date = '2026-03-23' WHERE id = '72fe0728-b082-4636-bc5e-275c5f1bf2c0' AND report_date = '2026-03-21';
  UPDATE public.daily_reports SET report_date = '2026-04-20' WHERE id = '765e22d9-350b-4afa-847a-e2a1afe9dc8b' AND report_date = '2026-04-18';
  UPDATE public.daily_reports SET report_date = '2026-04-13' WHERE id = '7a0b9cba-c49e-4436-858c-dc0f28c42934' AND report_date = '2026-04-10';
  UPDATE public.daily_reports SET report_date = '2026-08-03' WHERE id = '8130183c-7dd0-4b53-8d1c-0705890661e3' AND report_date = '2026-08-01';
  UPDATE public.daily_reports SET report_date = '2026-03-30' WHERE id = '8277b91a-60f4-4cdd-ae55-39ee0212dcc2' AND report_date = '2026-03-28';
  UPDATE public.daily_reports SET report_date = '2026-03-21' WHERE id = '849a9555-b4b9-4573-a2fe-8e49c095db42' AND report_date = '2026-03-30';
  UPDATE public.daily_reports SET report_date = '2026-05-22' WHERE id = '84fb151e-dd8d-4516-931f-63485d0a02fe' AND report_date = '2026-05-28';
  UPDATE public.daily_reports SET report_date = '2026-08-10' WHERE id = '8641a5ab-0020-4f0a-8553-295e873518f1' AND report_date = '2026-08-08';
  UPDATE public.daily_reports SET report_date = '2026-09-07' WHERE id = '8eae7ca9-c927-4a77-95f4-6ce205520bfc' AND report_date = '2026-09-04';
  UPDATE public.daily_reports SET report_date = '2026-04-13' WHERE id = 'a069ec22-300f-480f-b33d-82ddc640cd04' AND report_date = '2026-04-11';
  UPDATE public.daily_reports SET report_date = '2026-08-14' WHERE id = 'a5298cb3-a8d9-4e4b-b55e-87e10d1da8b8' AND report_date = '2026-08-18';
  UPDATE public.daily_reports SET report_date = '2026-08-17' WHERE id = 'a794ede1-336a-42a9-8eec-eb874042557b' AND report_date = '2026-08-15';
  UPDATE public.daily_reports SET report_date = '2026-05-29' WHERE id = 'aea16f83-67aa-4cdb-a377-8e6f734c8ff5' AND report_date = '2026-06-05';
  UPDATE public.daily_reports SET report_date = '2026-03-31' WHERE id = 'bdef2385-adac-4b83-9282-6fba603a4dbd' AND report_date = '2026-03-28';
  UPDATE public.daily_reports SET report_date = '2026-09-01' WHERE id = 'c7fd03ec-49c8-439b-9448-0c762c9e6ebd' AND report_date = '2026-08-29';
  UPDATE public.daily_reports SET report_date = '2026-08-17' WHERE id = 'd173d7d9-2c8e-43c5-82f1-92da13fecd6b' AND report_date = '2026-08-15';
  UPDATE public.daily_reports SET report_date = '2026-04-20' WHERE id = 'd40b48a6-5b4a-4278-b206-dc009f42fa9c' AND report_date = '2026-04-18';
  UPDATE public.daily_reports SET report_date = '2026-03-23' WHERE id = 'd6389649-3fcb-4551-b37e-93392afac97a' AND report_date = '2026-03-21';
  UPDATE public.daily_reports SET report_date = '2026-06-05' WHERE id = 'd68506e0-ec83-4c5d-bfd9-3d2e9291fc08' AND report_date = '2026-06-08';
  UPDATE public.daily_reports SET report_date = '2026-08-24' WHERE id = 'dcba2089-906d-43c6-8040-a8e6ced7eb82' AND report_date = '2026-08-22';
  UPDATE public.daily_reports SET report_date = '2026-03-28' WHERE id = 'e405d7a8-8894-4274-a575-9727639ef4c3' AND report_date = '2026-03-31';
  UPDATE public.daily_reports SET report_date = '2026-08-04' WHERE id = 'e6c3a9f2-607d-4feb-b5b7-1f436a83582d' AND report_date = '2026-08-06';
  UPDATE public.daily_reports SET report_date = '2026-03-27' WHERE id = 'ef55574f-d38d-4957-9697-9d89c58f6804' AND report_date = '2026-04-02';
  UPDATE public.daily_reports SET report_date = '2026-04-15' WHERE id = 'f772d348-0c66-443f-8c15-75eca16d12df' AND report_date = '2026-04-10';

  RAISE NOTICE '成功完成 39 条历史错位日报的安全回滚！';
END $$;
