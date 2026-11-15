import type { ScreenshotType } from "./ocr-contract";

export function buildPromptByType(type: ScreenshotType | null): string {
  if (!type) return buildAutoPrompt();
  if (type === "retention") return buildRetentionPrompt();
  return buildPrompt();
}

function buildAutoPrompt(): string {
  return [
    "你是抖音数据截图 OCR 助手。请同时识别互动数据族和完播留存族，严格只返回 JSON，不要自报截图类型。",
    "互动数据族字段：play_count、likes、comments、shares、favorites、follower_gain。",
    "完播留存族字段：retention_metrics 下的 avg_play_duration、avg_play_ratio、bounce_rate_2s、completion_rate_5s、completion_rate。",
    "另加 video_title、published_at、published_at_text、published_at_confidence、confidence。",
    "无法确定的字段返回 null；标题去掉末尾话题；发布时间只能依据明确的‘发布’文字，不能从趋势图横轴推断。",
    "只返回 JSON，不要 markdown，不要解释。",
  ].join("\n");
}

function buildPrompt(): string {
  return [
    "你是抖音数据截图 OCR 助手。",
    "请识别截图中的作品标题、6 个核心指标，以及页面顶部明确标注的作品发布时间，并严格只返回 JSON。",
    "要求：",
    "1. 字段固定为 video_title、play_count、likes、comments、shares、favorites、follower_gain、confidence。",
    "2. video_title 返回页面明确显示的作品主标题；标题末尾的 #话题、话题词和话题标签不属于标题，必须去掉；无法确定时返回 null。",
    "3. play_count 返回真实播放量数字，例如 32100；如果截图写的是 3.21万，请换算为 32100。",
    "4. likes、comments、shares、favorites、follower_gain 返回整数。",
    "5. 无法确定的字段返回 null。",
    "6. confidence 必须包含以上 6 个指标字段，值只能是 high、medium、low。",
    "7. published_at 必须返回带时区的 ISO 8601 时间；只能依据明确的‘发布’文字，不要从趋势图横轴推断。无法确定时返回 null。",
    "8. published_at_text 返回截图中的原始日期文字，published_at_confidence 只能是 high、medium、low。",
    "9. 只返回 JSON，不要 markdown，不要解释。",
    "返回示例：",
    JSON.stringify({
      play_count: 32100,
      video_title: "示例作品标题",
      likes: 1280,
      comments: 68,
      shares: 15,
      favorites: 106,
      follower_gain: 42,
      published_at: "2026-03-05T20:42:00+08:00",
      published_at_text: "2026-03-05 20:42 发布",
      published_at_confidence: "high",
      confidence: {
        play_count: "high",
        likes: "high",
        comments: "medium",
        shares: "medium",
        favorites: "low",
        follower_gain: "medium",
      },
    }),
  ].join("\n");
}

function buildRetentionPrompt(): string {
  return [
    "你是抖音跳出回看图识别助手。",
    "请识别截图中的作品标题、完播留存核心数值，并识别页面明确标注的作品发布时间；严格返回 JSON。",
    "字段固定为 recognized、video_title、retention_metrics、confidence。",
    "video_title 只保留作品主标题，去掉标题中或标题末尾的 #话题、话题词和话题标签；无法确定时返回 null。",
    "retention_metrics 必须包含 avg_play_duration、avg_play_ratio、bounce_rate_2s、completion_rate_5s、completion_rate。",
    "avg_play_duration 返回秒数纯数字，不要带‘秒’。",
    "avg_play_ratio、bounce_rate_2s、completion_rate_5s、completion_rate 返回 0-100 的百分比纯数字，不要带‘%’。",
    "无法确定的字段返回 null。",
    "无法识别时返回 { recognized:false, reason:'...' }。",
    "published_at 只能依据明确的‘发布’文字，不能从趋势图横轴推断；无法确定时返回 null，并带 published_at_confidence。",
    "只返回 JSON，不要解释。",
    JSON.stringify({
      recognized: true,
      video_title: "示例作品标题",
      retention_metrics: {
        avg_play_duration: 23.6,
        avg_play_ratio: 23.02,
        bounce_rate_2s: 41.2,
        completion_rate_5s: 32.8,
        completion_rate: 18.5,
      },
      confidence: 0.78,
      published_at: "2026-03-05T20:42:00+08:00",
      published_at_text: "2026-03-05 20:42 发布",
      published_at_confidence: "high",
    }),
  ].join("\n");
}
