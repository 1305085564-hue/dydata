import { getAccountBaseline, median } from "@/lib/video-metrics";
import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import type { AnalyticsVideoRow, 干预项, 干预结论卡数据, 可信度等级, 结论候选项, 结论卡数据, 视频结论卡结果 } from "./视频结论卡-类型";

const MIN_CARD_SAMPLE = 10;
const MIN_BUCKET_SAMPLE = 3;
const MIN_HOUR_BUCKET_SAMPLE = 2;
const RECENT_WINDOW_SIZE = 7;
const MIN_WINDOW_SAMPLE = 3;
const DROP_THRESHOLD = 0.3;
const LOW_BASELINE_RATIO = 0.5;
const CONSECUTIVE_LOW_COUNT = 3;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface VideoSample {
  video: AnalyticsVideoRow;
  playCount: number;
  publishedAt: Date | null;
}

function getConfidence(sampleCount: number): 可信度等级 {
  if (sampleCount >= 30) return "high";
  if (sampleCount >= 10) return "medium";
  return "low";
}

function formatCompactNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}

function formatPercent(value: number | null, digits = 0, withSign = false) {
  if (value === null || Number.isNaN(value)) return "—";
  const percent = value * 100;
  const prefix = withSign && percent > 0 ? "+" : "";
  return `${prefix}${percent.toFixed(digits)}%`;
}

function getEmptyCard(title: string, eyebrow: string, sampleCount = 0, footnote?: string): 结论卡数据 {
  return {
    title,
    eyebrow,
    summary: "样本不足，暂无结论",
    sampleCount,
    confidence: getConfidence(sampleCount),
    insufficient: true,
    metrics: [
      { label: "已纳入样本", value: String(sampleCount) },
      { label: "可信度", value: getConfidenceEmoji(getConfidence(sampleCount)) },
    ],
    footnote,
  };
}

function getEmptyInterventionCard(sampleCount = 0): 干预结论卡数据 {
  return {
    ...getEmptyCard("需干预人员/账号", "Intervention", sampleCount),
    items: [],
  };
}

function getConfidenceEmoji(confidence: 可信度等级) {
  if (confidence === "high") return "🟢 高";
  if (confidence === "medium") return "🟡 中";
  return "🔴 低";
}

function getLatest24hSnapshotMap(snapshots: VideoMetricsSnapshot[]) {
  return snapshots.reduce<Map<string, VideoMetricsSnapshot>>((map, snapshot) => {
    if (snapshot.snapshot_type !== "24h") return map;
    const current = map.get(snapshot.video_id);
    if (!current || new Date(snapshot.captured_at).getTime() > new Date(current.captured_at).getTime()) {
      map.set(snapshot.video_id, snapshot);
    }
    return map;
  }, new Map());
}

function buildSamples(videos: AnalyticsVideoRow[], snapshots: VideoMetricsSnapshot[]) {
  const snapshotMap = getLatest24hSnapshotMap(snapshots);
  return videos
    .map<VideoSample | null>((video) => {
      const snapshot = snapshotMap.get(video.id);
      if (!snapshot || snapshot.play_count <= 0) return null;
      const publishedAt = video.published_at ? new Date(video.published_at) : null;
      return {
        video,
        playCount: snapshot.play_count,
        publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      };
    })
    .filter((item): item is VideoSample => item !== null);
}

function getWeeklySamples(samples: VideoSample[]) {
  const now = Date.now();
  const weekly = samples.filter((sample) => {
    if (!sample.publishedAt) return false;
    return now - sample.publishedAt.getTime() <= ONE_WEEK_MS;
  });
  return weekly.length > 0 ? weekly : samples;
}

function calculateP70(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.7) - 1);
  return sorted[index] ?? null;
}

function buildTagCard(params: {
  title: string;
  eyebrow: string;
  dimension: VideoTag["tag_dimension"];
  samples: VideoSample[];
  videoTags: VideoTag[];
}): 结论卡数据 {
  const { title, eyebrow, dimension, samples, videoTags } = params;
  const sampleMap = new Map(samples.map((sample) => [sample.video.id, sample]));
  const relevantTags = videoTags.filter((tag) => tag.tag_dimension === dimension && sampleMap.has(tag.video_id));
  const totalSampleCount = relevantTags.length;

  if (totalSampleCount < MIN_CARD_SAMPLE) {
    return getEmptyCard(title, eyebrow, totalSampleCount);
  }

  const teamP70 = calculateP70(samples.map((sample) => sample.playCount));
  const groups = new Map<string, number[]>();

  for (const tag of relevantTags) {
    const sample = sampleMap.get(tag.video_id);
    if (!sample) continue;
    const group = groups.get(tag.tag_value) ?? [];
    group.push(sample.playCount);
    groups.set(tag.tag_value, group);
  }

  const candidates: 结论候选项[] = [];

  for (const [label, playCounts] of groups.entries()) {
    if (playCounts.length < MIN_BUCKET_SAMPLE) continue;
    const groupMedian = median(playCounts);
    if (groupMedian === null) continue;
    const otherPlayCounts = samples
      .filter((sample) => !relevantTags.some((tag) => tag.video_id === sample.video.id && tag.tag_value === label))
      .map((sample) => sample.playCount);
    const otherMedian = median(otherPlayCounts);
    const hitCount = teamP70 === null ? 0 : playCounts.filter((value) => value >= teamP70).length;

    candidates.push({
      label,
      sampleCount: playCounts.length,
      medianPlay: groupMedian,
      hotRate: teamP70 === null ? null : hitCount / playCounts.length,
      lift: otherMedian && otherMedian > 0 ? (groupMedian - otherMedian) / otherMedian : null,
    });
  }

  candidates.sort((a, b) => b.medianPlay - a.medianPlay || b.sampleCount - a.sampleCount);
  const best = candidates[0];

  if (!best) {
    return getEmptyCard(title, eyebrow, totalSampleCount, "候选标签样本过少，未形成稳定排序");
  }

  return {
    title,
    eyebrow,
    summary: best.label,
    sampleCount: best.sampleCount,
    confidence: getConfidence(best.sampleCount),
    insufficient: false,
    metrics: [
      { label: "24h 播放中位数", value: formatCompactNumber(best.medianPlay) },
      { label: "爆款率", value: formatPercent(best.hotRate, 0) },
      { label: "对比组提升", value: formatPercent(best.lift, 0, true) },
    ],
    footnote: `本周共分析 ${totalSampleCount} 条${dimension}样本`,
  };
}

function formatHourRange(hour: number) {
  const value = String(hour).padStart(2, "0");
  return `${value}:00-${value}:59`;
}

function buildHourCard(samples: VideoSample[]): 结论卡数据 {
  const eligible = samples.filter((sample) => sample.publishedAt);

  if (eligible.length < MIN_CARD_SAMPLE) {
    return getEmptyCard("最佳发布时间段", "Publish Window", eligible.length);
  }

  const groups = new Map<number, number[]>();
  for (const sample of eligible) {
    const hour = sample.publishedAt!.getHours();
    const group = groups.get(hour) ?? [];
    group.push(sample.playCount);
    groups.set(hour, group);
  }

  const candidates = Array.from(groups.entries())
    .filter(([, playCounts]) => playCounts.length >= MIN_HOUR_BUCKET_SAMPLE)
    .map(([hour, playCounts]) => {
      const groupMedian = median(playCounts);
      const otherPlayCounts = eligible.filter((sample) => sample.publishedAt!.getHours() !== hour).map((sample) => sample.playCount);
      const otherMedian = median(otherPlayCounts);
      return {
        hour,
        sampleCount: playCounts.length,
        medianPlay: groupMedian,
        lift: groupMedian !== null && otherMedian && otherMedian > 0 ? (groupMedian - otherMedian) / otherMedian : null,
      };
    })
    .filter((item): item is { hour: number; sampleCount: number; medianPlay: number; lift: number | null } => item.medianPlay !== null)
    .sort((a, b) => b.medianPlay - a.medianPlay || b.sampleCount - a.sampleCount);

  const best = candidates[0];
  if (!best) {
    return getEmptyCard("最佳发布时间段", "Publish Window", eligible.length, "有效小时分组样本过少");
  }

  return {
    title: "最佳发布时间段",
    eyebrow: "Publish Window",
    summary: formatHourRange(best.hour),
    sampleCount: best.sampleCount,
    confidence: getConfidence(best.sampleCount),
    insufficient: false,
    metrics: [
      { label: "24h 播放中位数", value: formatCompactNumber(best.medianPlay) },
      { label: "对比组提升", value: formatPercent(best.lift, 0, true) },
      { label: "本周有效样本", value: String(eligible.length) },
    ],
    footnote: "按发布时间小时分组，优先比较中位数表现",
  };
}

function buildInterventionCard(samples: VideoSample[]): 干预结论卡数据 {
  if (samples.length < MIN_CARD_SAMPLE) {
    return getEmptyInterventionCard(samples.length);
  }

  const teamMedian = median(samples.map((sample) => sample.playCount));
  const accountMap = new Map<string, VideoSample[]>();

  for (const sample of samples) {
    const key = sample.video.account_id;
    const list = accountMap.get(key) ?? [];
    list.push(sample);
    accountMap.set(key, list);
  }

  const items: 干预项[] = [];
  let analyzedAccounts = 0;

  for (const [accountId, accountSamples] of accountMap.entries()) {
    const sortedSamples = [...accountSamples].sort((a, b) => {
      const aTime = a.publishedAt?.getTime() ?? 0;
      const bTime = b.publishedAt?.getTime() ?? 0;
      return bTime - aTime;
    });
    const playCounts = sortedSamples.map((item) => item.playCount);
    const baseline = getAccountBaseline(playCounts, teamMedian);
    const reasons: string[] = [];
    let dropRatio: number | null = null;

    const recent = playCounts.slice(0, RECENT_WINDOW_SIZE);
    const previous = playCounts.slice(RECENT_WINDOW_SIZE, RECENT_WINDOW_SIZE * 2);

    if (recent.length >= MIN_WINDOW_SAMPLE && previous.length >= MIN_WINDOW_SAMPLE) {
      const recentMedian = median(recent);
      const previousMedian = median(previous);
      if (recentMedian !== null && previousMedian !== null && previousMedian > 0) {
        dropRatio = (previousMedian - recentMedian) / previousMedian;
        if (dropRatio >= DROP_THRESHOLD) {
          reasons.push(`近7条较前7条下降 ${formatPercent(dropRatio, 0)}`);
        }
      }
    }

    if (baseline.median !== null && sortedSamples.length >= CONSECUTIVE_LOW_COUNT) {
      const lowThreshold = baseline.median * LOW_BASELINE_RATIO;
      const recentThree = sortedSamples.slice(0, CONSECUTIVE_LOW_COUNT);
      if (recentThree.every((item) => item.playCount < lowThreshold)) {
        reasons.push("连续3条低于账号基线50%");
      }
    }

    if (baseline.median !== null || recent.length >= MIN_WINDOW_SAMPLE) {
      analyzedAccounts += 1;
    }

    if (reasons.length === 0) continue;

    const first = sortedSamples[0];
    items.push({
      accountId,
      accountName: first.video.accounts?.name ?? "未知账号",
      ownerName: first.video.profiles?.name ?? "未知",
      dropRatio,
      triggerReasons: reasons,
    });
  }

  items.sort((a, b) => (b.dropRatio ?? 0) - (a.dropRatio ?? 0) || a.accountName.localeCompare(b.accountName, "zh-CN"));

  if (analyzedAccounts < MIN_CARD_SAMPLE) {
    return getEmptyInterventionCard(analyzedAccounts);
  }

  const topItems = items.slice(0, 3);
  const summary = items.length > 0 ? `需干预 ${items.length} 个账号` : "近期未发现明显需干预账号";

  return {
    title: "需干预人员/账号",
    eyebrow: "Intervention",
    summary,
    sampleCount: analyzedAccounts,
    confidence: getConfidence(analyzedAccounts),
    insufficient: false,
    metrics: [
      { label: "命中账号", value: String(items.length) },
      { label: "重点负责人", value: topItems[0]?.ownerName ?? "—" },
      { label: "最大下滑", value: formatPercent(topItems[0]?.dropRatio ?? null, 0) },
    ],
    footnote: items.length > 0 ? "命中“中位数下滑”或“连续低于基线”任一规则" : "近 7 条与账号基线暂未出现明显异常",
    items: topItems,
  };
}

export function 生成视频结论卡结果(params: {
  videos: AnalyticsVideoRow[];
  snapshots: VideoMetricsSnapshot[];
  videoTags: VideoTag[];
}): 视频结论卡结果 {
  const allSamples = buildSamples(params.videos, params.snapshots);
  const weeklySamples = getWeeklySamples(allSamples);

  return {
    bestTopic: buildTagCard({
      title: "本周最值得放大的题材",
      eyebrow: "Winning Topic",
      dimension: "题材",
      samples: weeklySamples,
      videoTags: params.videoTags,
    }),
    bestFormat: buildTagCard({
      title: "本周最强表达形式",
      eyebrow: "Best Format",
      dimension: "表达形式",
      samples: weeklySamples,
      videoTags: params.videoTags,
    }),
    bestPublishHour: buildHourCard(weeklySamples),
    intervention: buildInterventionCard(allSamples),
  };
}

export function 获取可信度文案(confidence: 可信度等级) {
  return getConfidenceEmoji(confidence);
}
