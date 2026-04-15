-- 047: 文案改写运行上限配置

alter table public.ai_feature_config
  add column if not exists output_token_limit int not null default 3600,
  add column if not exists context_message_limit int not null default 30;

alter table public.ai_feature_config
  drop constraint if exists ai_feature_config_output_token_limit_check;

alter table public.ai_feature_config
  add constraint ai_feature_config_output_token_limit_check
  check (output_token_limit between 1200 and 8000);

alter table public.ai_feature_config
  drop constraint if exists ai_feature_config_context_message_limit_check;

alter table public.ai_feature_config
  add constraint ai_feature_config_context_message_limit_check
  check (context_message_limit between 1 and 50);

update public.ai_feature_config
set
  output_token_limit = 3600,
  context_message_limit = 30,
  updated_at = timezone('utc'::text, now())
where feature_key = 'content_rewrite'
  and (
    output_token_limit is distinct from 3600
    or context_message_limit is distinct from 30
  );
