-- 20260630000000: 合并冗余渠道与对齐渠道分组语义
-- 1. 确保目标主渠道存在
insert into public.ai_providers (name, base_url, priority)
values
  ('api7', 'https://www.aiapikey.net', 1),
  ('api1', 'https://ai.ltcraft.cn', 2)
on conflict (name) do nothing;

-- 2. 将 api7 系列的 keys 转移并重命名为分组
-- 转移 api7-gemin 下的 key
update public.ai_provider_keys
set 
  provider_id = (select id from public.ai_providers where name = 'api7'),
  label = 'gemin'
where provider_id = (select id from public.ai_providers where name = 'api7-gemin')
  and label = 'api7-gemin-default';

-- 转移 api7-claude 下 the key
update public.ai_provider_keys
set 
  provider_id = (select id from public.ai_providers where name = 'api7'),
  label = 'claude'
where provider_id = (select id from public.ai_providers where name = 'api7-claude')
  and label = 'api7-claude-default';

-- 重命名 api7 自身原本的 default key
update public.ai_provider_keys
set label = 'default'
where provider_id = (select id from public.ai_providers where name = 'api7')
  and label = 'api7-default';

-- 3. 将 api1 系列的 keys 转移并重命名为分组
-- 转移 api1 claude 下的 key
update public.ai_provider_keys
set 
  provider_id = (select id from public.ai_providers where name = 'api1'),
  label = 'claude'
where provider_id = (select id from public.ai_providers where name = 'api1 claude')
  and label = 'api1 claude-default';

-- 重命名 api1 自身原本的 default key
update public.ai_provider_keys
set label = 'default'
where provider_id = (select id from public.ai_providers where name = 'api1')
  and label = 'api1-default';

-- 4. 清理其他单一渠道的分组后缀
update public.ai_provider_keys
set label = 'default'
where label like '%-default';

-- 5. 安全删除已被掏空的冗余渠道
delete from public.ai_providers
where name in ('api7-gemin', 'api7-claude', 'api1 claude');
