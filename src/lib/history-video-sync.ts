export function isHistoryVideoSyncFailure(
  videoId: string | null,
  result: { data?: unknown; error?: unknown } | null | undefined,
) {
  return Boolean(result?.error) || Boolean(videoId && !result?.data);
}
