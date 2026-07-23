-- 视频复盘与素材库异常警戒阈值：持久化默认配置并收紧 system_settings 的 RLS。

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated users read system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Owners and team admins insert system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Owners and team admins update system settings" ON public.system_settings;

CREATE POLICY "Authenticated users read system settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners and team admins insert system settings"
  ON public.system_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND (
          role = 'owner'
          OR (role = 'admin' AND permissions->>'manage_members' = 'true')
        )
    )
  );

CREATE POLICY "Owners and team admins update system settings"
  ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND (
          role = 'owner'
          OR (role = 'admin' AND permissions->>'manage_members' = 'true')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND (
          role = 'owner'
          OR (role = 'admin' AND permissions->>'manage_members' = 'true')
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.system_settings TO authenticated;

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'video_review_thresholds',
  '{"bounce_rate_2s":30,"completion_rate_5s":50,"avg_play_duration":30,"completion_rate":5,"play_count":1000}'::jsonb,
  '视频复盘与素材库异常警戒阈值'
)
ON CONFLICT (key) DO NOTHING;
