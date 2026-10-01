/** 发布时间是平台截图识别出的事实；历史编辑只能沿用已保存事实。 */
export function resolveImmutablePublishedAt(
  existingPublishedAt: string | null | undefined,
  submittedPublishedAt: string | null | undefined,
) {
  return existingPublishedAt ?? submittedPublishedAt ?? null;
}
