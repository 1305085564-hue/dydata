-- 041: 新增截图识别 AI 功能配置项

insert into public.ai_feature_config (feature_key, label)
values ('ocr_screenshot', '截图识别')
on conflict (feature_key) do nothing;
