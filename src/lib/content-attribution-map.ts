// 归因映射表 — 来源：产品设计总纲 §4（2026-07-18 定稿）
// 心脏文件，阿禅可直接修改阈值和映射说明，改完后台重启即生效

export type MetricCategory = "A" | "B" | "C";
export type LocateKind = "segment" | "attribute";
export type SegmentHint = "opening" | "middle" | "ending";

export interface MetricMapEntry {
  metric: MetricKey;
  label: string;
  /** 越高越差（如跳出率）；默认越低越差 */
  lowerIsBetter: boolean;
  category: MetricCategory;
  /** 指向内容问题的描述（差了→哪出问题） */
  points_to: string;
  locate_kind: LocateKind;
  /** segment 类的默认分段提示；运行时会被实际计算覆盖 */
  default_segment_hint: SegmentHint | null;
}

export type MetricKey =
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "avg_play_duration"
  | "completion_rate"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain"
  | "play_count";

export const METRIC_MAP: MetricMapEntry[] = [
  // === A 类 · 留存质量（能落到时间轴段/句）===
  {
    metric: "bounce_rate_2s",
    label: "2s跳出率",
    lowerIsBetter: true, // 越高越差
    category: "A",
    points_to: "封面/标题/前两句没抓住人，开篇钩子失败",
    locate_kind: "segment",
    default_segment_hint: "opening",
  },
  {
    metric: "completion_rate_5s",
    label: "5s完播率",
    lowerIsBetter: false, // 越低越差
    category: "A",
    points_to: "开头钩子弱，没给继续看的理由",
    locate_kind: "segment",
    default_segment_hint: "opening",
  },
  {
    metric: "avg_play_duration",
    label: "均播时长",
    lowerIsBetter: false,
    category: "A",
    points_to: "多数人看到某处就划走，那段内容崩了",
    locate_kind: "segment",
    default_segment_hint: null, // 运行时按均播/总时长比例推算
  },
  {
    metric: "completion_rate",
    label: "完播率",
    lowerIsBetter: false,
    category: "A",
    points_to: "中段拖沓或结尾没收住",
    locate_kind: "segment",
    default_segment_hint: "ending",
  },
  // === B 类 · 互动转化（落到内容属性，不硬凑单句）===
  {
    metric: "likes",
    label: "点赞数",
    lowerIsBetter: false,
    category: "B",
    points_to: "观点平淡，没戳中情绪，缺少情绪共鸣点",
    locate_kind: "attribute",
    default_segment_hint: null,
  },
  {
    metric: "comments",
    label: "评论数",
    lowerIsBetter: false,
    category: "B",
    points_to: "没争议/共鸣/记忆点，缺讨论钩子",
    locate_kind: "attribute",
    default_segment_hint: null,
  },
  {
    metric: "shares",
    label: "分享数",
    lowerIsBetter: false,
    category: "B",
    points_to: "没社交货币，内容不值得转发",
    locate_kind: "attribute",
    default_segment_hint: null,
  },
  {
    metric: "favorites",
    label: "收藏数",
    lowerIsBetter: false,
    category: "B",
    points_to: "缺实用干货，看完即弃，复用价值低",
    locate_kind: "attribute",
    default_segment_hint: null,
  },
  {
    metric: "follower_gain",
    label: "涨粉数",
    lowerIsBetter: false,
    category: "B",
    points_to: "人设/价值不清晰，缺关注引导",
    locate_kind: "attribute",
    default_segment_hint: null,
  },
  // === C 类 · 流量结果（先回溯 A 类再看封面标题）===
  {
    metric: "play_count",
    label: "播放量",
    lowerIsBetter: false,
    category: "C",
    points_to: "播放低是结果，先看封面/标题，再回溯 2s/5s 留存是否撑住",
    locate_kind: "segment",
    default_segment_hint: "opening",
  },
];

export const METRIC_MAP_INDEX = new Map<MetricKey, MetricMapEntry>(
  METRIC_MAP.map((e) => [e.metric, e]),
);

// 异常判定阈值（与 MetricBarCard ±8% 惯例对齐，可统一调整）
export const THRESHOLD_BAD = 15; // 偏离 ≥15%（百分比）或 ≥8 个百分点（比率类）
export const THRESHOLD_WARN = 8; // 8%~15%
export const THRESHOLD_RATE_BAD_PP = 8; // 比率类（以百分点为单位）bad 阈值
export const THRESHOLD_RATE_WARN_PP = 4; // 比率类 warn 阈值

/** 是否是比率型指标（存储值单位为百分数，如 22.5 = 22.5%） */
export const RATE_METRICS = new Set<MetricKey>([
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
]);
