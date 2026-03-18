-- 视频标签表
CREATE TABLE IF NOT EXISTS public.video_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  tag_dimension text NOT NULL CHECK (tag_dimension IN ('题材','表达形式','CTA类型','内容结构','目标受众')),
  tag_value text NOT NULL,
  source text DEFAULT 'manual' CHECK (source IN ('ai','manual')),
  confidence numeric,
  reviewed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tags_video ON public.video_tags(video_id);

ALTER TABLE public.video_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "通过视频继承读权限" ON public.video_tags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

CREATE POLICY "员工创建自己视频的标签" ON public.video_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND user_id = auth.uid())
  );

CREATE POLICY "管理员管理全部标签" ON public.video_tags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- 市场环境表
CREATE TABLE IF NOT EXISTS public.market_context_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_date date UNIQUE NOT NULL,
  is_trading_day boolean DEFAULT true,
  market_change jsonb,
  market_sentiment text CHECK (market_sentiment IN ('强','中','弱')),
  hot_sectors text[],
  source text DEFAULT 'manual' CHECK (source IN ('manual','api')),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_market_date ON public.market_context_daily(context_date);

ALTER TABLE public.market_context_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "登录用户可读市场数据" ON public.market_context_daily
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "管理员管理市场数据" ON public.market_context_daily
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- 建议执行记录表
CREATE TABLE IF NOT EXISTS public.advice_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES public.profiles(id),
  target_account_id uuid REFERENCES public.accounts(id),
  advice_content text NOT NULL,
  evidence text,
  advice_source text DEFAULT 'manager' CHECK (advice_source IN ('ai','manager')),
  status text DEFAULT '待查看' CHECK (status IN ('待查看','已查看','待执行','已执行','已忽略','已复核')),
  assigned_by uuid REFERENCES public.profiles(id),
  executed_video_id uuid REFERENCES public.videos(id),
  review_result text CHECK (review_result IN ('有效','无效','不确定')),
  reviewed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_advice_target ON public.advice_actions(target_user_id);

ALTER TABLE public.advice_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "员工看自己的建议" ON public.advice_actions
  FOR SELECT USING (target_user_id = auth.uid());

CREATE POLICY "员工更新自己的建议状态" ON public.advice_actions
  FOR UPDATE USING (target_user_id = auth.uid());

CREATE POLICY "管理员管理全部建议" ON public.advice_actions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );
