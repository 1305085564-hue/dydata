const TOPIC_LIBRARY_STATUS_ENDPOINT = "/api/admin/content/topic-library-status";
const MAX_VIDEO_IDS = 400;

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
