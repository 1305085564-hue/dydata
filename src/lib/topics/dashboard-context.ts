const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 只接受数据库子题使用的 UUID，避免把任意查询参数带入提交上下文。
 */
export function normalizeDashboardTopicId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

/**
 * 选题标题只用于工作台的提示文案，不参与任何写入；限制长度避免把整段任意文本塞进 URL。
 */
export function normalizeDashboardTopicTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 120) : null;
}

/**
 * 生成从“脚本中”入口进入工作台的稳定链接。
 * 无效 ID 不带查询参数，避免打开一个看似有关联、实际不可保存的工作台。
 */
export function buildDashboardTopicHref(subTopicId: unknown, subTopicTitle?: unknown): string {
  const normalized = normalizeDashboardTopicId(subTopicId);
  if (!normalized) return "/dashboard";

  const params = new URLSearchParams({ topic_id: normalized });
  const title = normalizeDashboardTopicTitle(subTopicTitle);
  if (title) params.set("topic_title", title);
  return `/dashboard?${params.toString()}`;
}
