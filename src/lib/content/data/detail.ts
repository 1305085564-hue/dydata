/** 详情生命周期请求保持原有接口路径与响应处理契约。 */
export async function requestVideoLifecycleAction(
  videoId: string,
  action: "trash" | "restore" | "purge",
) {
  // 原调用路径：fetch(`/api/admin/videos/${video.id}/lifecycle`, ...)
  const res = await fetch(`/api/admin/videos/${videoId}/lifecycle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = await res.json();
  return { res, data };
}
