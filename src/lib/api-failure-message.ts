/** 只展示接口约定的安全 error 文案，不读取底层异常或调试字段。 */
export async function getApiFailureMessage(response: Response | undefined, fallback: string): Promise<string> {
  if (!response) return "网络连接异常，请检查网络后重试。";
  if (response.status === 401) return "登录状态已失效，请刷新页面或重新登录。";

  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  if (response.status === 403) return "当前账号无权限执行此操作。";
  if (response.status === 429) return "操作过于频繁，请稍后再试。";
  if (response.status >= 500) return `后台服务暂时不可用（HTTP ${response.status}），请稍后重试。`;
  return response.ok ? "返回数据无法读取，请稍后重试。" : `${fallback}（HTTP ${response.status}）。`;
}
