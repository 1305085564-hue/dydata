CREATE TABLE IF NOT EXISTS public.tag_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  dimension text NOT NULL CHECK (dimension IN ('topic','hook_style','structure','cta')),
  tag_code text NOT NULL,
  tag_name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT TRUE,
  UNIQUE(org_id, dimension, tag_code)
);

ALTER TABLE public.tag_definition ENABLE ROW LEVEL SECURITY;

INSERT INTO public.tag_definition (dimension, tag_code, tag_name, sort_order) VALUES
  ('topic','emotion_cycle','情绪周期复盘',1),
  ('topic','dragon_stock','妖股龙头拆解',2),
  ('topic','loss_lesson','血泪避坑教训',3),
  ('topic','trading_method','交易心法',4),
  ('topic','hot_event','热点事件定性',5),
  ('topic','pre_market','盘前预判',6),
  ('hook_style','pnl_show','盈亏晒单起手',1),
  ('hook_style','contrarian','反共识暴论起手',2),
  ('hook_style','pain_point','痛点焦虑前置',3),
  ('hook_style','stock_mystery','热门个股悬念',4),
  ('structure','phenomenon_essence','现象-本质-对策',1),
  ('structure','wrong_right','错误-正确做法对比',2),
  ('structure','checklist','清单式',3),
  ('structure','deduction','步步推演式',4),
  ('cta','ask_list','索要名单指标',1),
  ('cta','vip_hint','进阶圈层暗示',2),
  ('cta','private_msg','私信个股解答',3),
  ('cta','no_cta','无明显CTA',4)
ON CONFLICT (org_id, dimension, tag_code) DO NOTHING;
