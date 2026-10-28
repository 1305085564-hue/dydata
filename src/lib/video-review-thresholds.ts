/**
 * 异常提醒仍使用固定规则；excellent/poor 与颜色样本门槛仅提供评价标准默认值。
 * 列表和详情的当前表现标准由公司配置读取，不直接使用此处默认数字。
 * 修改入口：管理中心 → 数据口径 → 评价标准；仅公司负责人可保存。
 */
/** 指标表现颜色的样本下限，与异常提醒和综合评级的播放门槛分别维护。 */
export const VIDEO_REVIEW_COLOR_MIN_PLAY = 3000;

export const VIDEO_REVIEW_RULE_THRESHOLDS = {
  bounce_rate_2s: 30,
  completion_rate_5s: 50,
  avg_play_duration: 30,
  completion_rate: 5,
  /** 异常提醒使用的播放量门槛。
   *  2026-10-24 阿禅调整：1,000 → 5,000；指标显示的样本下限另行维护。 */
  play_count: 5000,
  /** 列表和详情的表现区间；优质红、较差绿。 */
  excellent: {
    bounce_rate_2s: 25,
    completion_rate_5s: 60,
    completion_rate: 10,
    avg_play_duration: 40,
  },
  poor: {
    bounce_rate_2s: 35,
    completion_rate_5s: 50,
    completion_rate: 5,
    avg_play_duration: 20,
  },
} as const;

export type VideoReviewThresholds = {
  bounce_rate_2s: number;
  completion_rate_5s: number;
  avg_play_duration: number;
  completion_rate: number;
  play_count: number;
};
