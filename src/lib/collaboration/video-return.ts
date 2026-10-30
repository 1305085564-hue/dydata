/** 仅在档案打开后静默预检；关闭或切换来源后忽略旧请求。 */
export function precheckReturnVideo(
  isOpen: boolean,
  from: string | null,
  id: string | null,
  onValid: (valid: boolean) => void,
  request: typeof fetch = fetch,
) {
  onValid(false);
  if (!isOpen || from !== "video" || !id) return () => {};
  let cancelled = false;
  request(`/api/admin/content/${encodeURIComponent(id)}?view=all`, { cache: "no-store" })
    .then(res => { if (!cancelled) onValid(res.ok); })
    .catch(() => { if (!cancelled) onValid(false); });
  return () => { cancelled = true; };
}
