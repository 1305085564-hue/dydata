const TOPIC_LIBRARY_STATUS_ENDPOINT = "/api/admin/content/topic-library-status";
/** 与接口侧 MAX_TOPIC_LIBRARY_STATUS_VIDEO_IDS 对齐：单次请求最多 400 个 ID */
export const MAX_VIDEO_IDS = 400;

type TopicLibraryStatusRequest = {
  url: string;
  init: {
    method: "POST";
    headers: { "Content-Type": "application/json" };
    body: string;
  };
};

export function buildTopicLibraryStatusRequest(videoIds: string[]): TopicLibraryStatusRequest {
  const normalizedIds = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_VIDEO_IDS);

  return {
    url: TOPIC_LIBRARY_STATUS_ENDPOINT,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoIds: normalizedIds }),
    },
  };
}

/**
 * 全量列表（1800+ 条）必须分批请求：单次上限 400 个 ID，静默截断会让第 401 名之后的
 * 视频永远拿不到入库状态与话题分类（徽标缺失、筛选漏数据、第四格口径退化）。
 */
export function buildTopicLibraryStatusRequests(videoIds: string[]): TopicLibraryStatusRequest[] {
  const normalizedIds = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  const requests: TopicLibraryStatusRequest[] = [];
  for (let index = 0; index < normalizedIds.length; index += MAX_VIDEO_IDS) {
    requests.push(buildTopicLibraryStatusRequest(normalizedIds.slice(index, index + MAX_VIDEO_IDS)));
  }
  return requests;
}
