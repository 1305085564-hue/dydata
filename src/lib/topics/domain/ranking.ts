import type { ContentQualitySnapshot } from "@/lib/content-quality";
import { TOPIC_LIBRARY_QUALIFY_PLAY_COUNT } from "../metrics";
import type { RankedSubTopicSuggestion, SuggestedSubTopicCandidate, TopicWorkMetricInput, TopicWorkSummary } from "./types";
import { isRecord, tokenize } from "./internal";

export function rankSuggestedSubTopics(
  candidates: SuggestedSubTopicCandidate[],
  input: { title: string; content: string },
): RankedSubTopicSuggestion[] {
  const inputTokens = tokenize(`${input.title} ${input.content}`);
  const inputSet = new Set(inputTokens);

  return candidates
    .map((candidate) => {
      const candidateTokens = tokenize(`${candidate.title} ${candidate.hook} ${candidate.topicName ?? ""} ${candidate.groupName ?? ""}`);
      const overlap = candidateTokens.filter((token) => inputSet.has(token)).length;
      const exactBoost = `${input.title} ${input.content}`.includes(candidate.title) ? 3 : 0;
      return {
        ...candidate,
        score: overlap + exactBoost,
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-Hans-CN"))
    .slice(0, 3);
}

export function calculateTopicWorkSummary(rows: TopicWorkMetricInput[]): TopicWorkSummary {
  const qualified = rows.filter((row) => (row.playCount ?? 0) >= TOPIC_LIBRARY_QUALIFY_PLAY_COUNT);
  const totalPlayCount = qualified.reduce((sum, row) => sum + (row.playCount ?? 0), 0);
  const best = [...rows].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))[0] ?? null;
  const bestQualified = [...qualified].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))[0] ?? null;
  const latest = [...qualified].sort((a, b) => (Date.parse(b.uploadedAt ?? "") || 0) - (Date.parse(a.uploadedAt ?? "") || 0))[0] ?? null;

  return {
    qualifiedWorkCount: qualified.length,
    averagePlayCount: qualified.length ? Math.round(totalPlayCount / qualified.length) : null,
    bestPlayCount: best?.playCount ?? null,
    bestCopy: bestQualified?.content ?? null,
    latestCopy: latest?.content ?? null,
  };
}

/** 选题关联作品与视频复盘共用：只取最新一条 24h 快照，拒绝历史最大播放污染质量口径。 */
export function selectLatest24hSnapshot(value: unknown): ContentQualitySnapshot | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .filter((snapshot): snapshot is Record<string, unknown> => isRecord(snapshot))
    .filter((snapshot) => snapshot.snapshot_type === "24h")
    .sort((left, right) => (Date.parse(String(right.captured_at ?? "")) || 0) - (Date.parse(String(left.captured_at ?? "")) || 0));
  const snapshot = rows[0];
  if (!snapshot) return undefined;
  const nullableMetric = (metric: unknown) => typeof metric === "number" && Number.isFinite(metric) ? metric : null;
  return {
    playCount: nullableMetric(snapshot.play_count),
    likes: nullableMetric(snapshot.likes),
    comments: nullableMetric(snapshot.comments),
    shares: nullableMetric(snapshot.shares),
    favorites: nullableMetric(snapshot.favorites),
  };
}
