ALTER TABLE public.video_tags
  DROP CONSTRAINT IF EXISTS video_tags_tag_dimension_check;

ALTER TABLE public.video_tags
  ADD CONSTRAINT video_tags_tag_dimension_check
  CHECK (tag_dimension IN ('题材', '表达形式', 'CTA类型', '内容结构', '目标受众', '话题', '关键词'));

ALTER TABLE public.video_tags
  DROP CONSTRAINT IF EXISTS video_tags_video_dimension_key;

DROP INDEX IF EXISTS video_tags_single_dimension_key;
DROP INDEX IF EXISTS video_tags_keyword_value_key;

DELETE FROM public.video_tags a
USING public.video_tags b
WHERE a.id < b.id
  AND a.video_id = b.video_id
  AND (
    (a.tag_dimension = '关键词' AND b.tag_dimension = '关键词' AND a.tag_value = b.tag_value)
    OR (a.tag_dimension <> '关键词' AND b.tag_dimension <> '关键词' AND a.tag_dimension = b.tag_dimension)
  );

CREATE UNIQUE INDEX video_tags_single_dimension_key
  ON public.video_tags (video_id, tag_dimension)
  WHERE tag_dimension <> '关键词';

CREATE UNIQUE INDEX video_tags_keyword_value_key
  ON public.video_tags (video_id, tag_dimension, tag_value)
  WHERE tag_dimension = '关键词';
