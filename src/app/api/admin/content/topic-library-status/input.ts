export const MAX_TOPIC_LIBRARY_STATUS_VIDEO_IDS = 400;

type ParseVideoIdsResult =
  | { ok: true; videoIds: string[] }
  | { ok: false; error: string };

export function parseTopicLibraryStatusVideoIds(input: unknown): ParseVideoIdsResult {
  if (!input || typeof input !== "object" || !("videoIds" in input) || !Array.isArray(input.videoIds)) {
    return { ok: false, error: "videoIds 必须是字符串数组" };
  }

  if (input.videoIds.some((id) => typeof id !== "string")) {
    return { ok: false, error: "videoIds 必须是字符串数组" };
  }

  const videoIds = [...new Set(input.videoIds.map((id) => id.trim()).filter(Boolean))];
  if (videoIds.length > MAX_TOPIC_LIBRARY_STATUS_VIDEO_IDS) {
    return { ok: false, error: "单次最多查询 400 个视频" };
  }

  return { ok: true, videoIds };
}
