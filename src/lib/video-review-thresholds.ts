/**
 * 视频复盘的异常判定规则（代码内固定常量，不是可配置项）。
 *
 * 这五项曾可通过管理中心「系统设置」页在线改值（存 system_settings 表），
 * 但新版视频复盘只用 play_count 作样本下限、其余四项只参与优先级计分，管理员改值
 * 也改不动顶部异常提醒，编辑入口已于 2026-09-26 下线，规则固定在本文件。
 * 线上 system_settings 从未写入过该 key，取值即此处的值。
 * 改这里等于改视频复盘的异常判定口径，需走代码发布。
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
  /** 优质线（2026-10-24 定稿）：命中时标绿强调 */
  excellent: {
    bounce_rate_2s: 25,      // ≤25% 绿（约 19% 作品达到）
    completion_rate_5s: 55,  // ≥55% 绿（约 15%）
    completion_rate: 8,      // ≥8% 绿（约 22%）
    avg_play_duration: 40,   // ≥40s 绿（约 33%）
  },
  /** 预警线（2026-10-24 定稿）：命中时标红警示 */
  poor: {
    bounce_rate_2s: 36,      // ≥36% 红
    completion_rate_5s: 32,  // ≤32% 红
    completion_rate: 2.2,    // ≤2.2% 红
    avg_play_duration: 16,   // ≤16s 红
  },
} as const;

export type VideoReviewThresholds = {
  bounce_rate_2s: number;
  completion_rate_5s: number;
  avg_play_duration: number;
  completion_rate: number;
  play_count: number;
};
