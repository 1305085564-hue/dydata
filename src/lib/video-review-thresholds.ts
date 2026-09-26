/**
 * 视频复盘的异常判定规则（代码内固定常量，不是可配置项）。
 *
 * 这五项曾可通过管理中心「系统设置」页在线改值（存 system_settings 表），
 * 但新版视频复盘只用 play_count 作样本下限、其余四项只参与优先级计分，管理员改值
 * 也改不动顶部异常提醒，编辑入口已于 2026-09-26 下线，规则固定在本文件。
 * 线上 system_settings 从未写入过该 key，取值即此处的值。
 * 改这里等于改视频复盘的异常判定口径，需走代码发布。
 */
export const VIDEO_REVIEW_RULE_THRESHOLDS = {
  bounce_rate_2s: 30,
  completion_rate_5s: 50,
  avg_play_duration: 30,
  completion_rate: 5,
  /** 样本下限：播放量低于此值的稿子比率是噪音，列表按样本不足降灰 */
  play_count: 1000,
} as const;

export type VideoReviewThresholds = {
  bounce_rate_2s: number;
  completion_rate_5s: number;
  avg_play_duration: number;
  completion_rate: number;
  play_count: number;
};
