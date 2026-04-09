import { getAiFeatureMetadata, AI_FEATURE_GROUP_ORDER } from "@/lib/ai/feature-metadata";
import { buildGrowthDimensionCards, buildStatusCards, type AdviceSections, type GrowthDimensionCard, type GrowthPkRow, type ScriptBreakdownData, type StatusCardItem, type WeakBenchmarkCard } from "@/lib/growth-page";
import type { MetricsAccount, MetricsReport } from "@/lib/metrics";
import { build个人趋势数据, build团队趋势数据 } from "@/lib/趋势图";
import type { AccountLeaderboardRow, MarketContextDaily, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

type DemoProfile = {
  id: string;
  name: string;
  role: "member";
  status: "active" | "exempt";
  permissions: Record<string, boolean>;
};

type DemoAccount = MetricsAccount & {
  ownerName: string;
};

type DemoDailyReport = MetricsReport & {
  id: string;
  user_id: string;
  title: string;
  submitter: string;
  avg_play_duration: string;
  bounce_rate_2s: string;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  follower_convert: number;
  content: string;
  published_at: string;
  uploaded_at: string;
};

type DemoVideoRow = Video & {
  owner_name: string;
  account_name: string;
  content_direction: string | null;
};

type DemoFeatureRow = {
  id: string;
  feature_key: string;
  label: string;
  channel_name: string | null;
  model: string;
  is_enabled: boolean;
  updated_at: string;
  system_prompt: string;
};

type DemoActionHistory = {
  id: string;
  adminName: string;
  actionType: "query" | "modify" | "diagnosis" | "config_change";
  description: string;
  result: "success" | "pending_confirm";
  createdAt: string;
};

export const DEMO_VIEWER = {
  id: "demo-viewer",
  name: "演示访客",
  focusProfileId: "demo-profile-01",
  role: "owner" as const,
};

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatDateTime(date: Date) {
  return date.toISOString();
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function percent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}

const profileNames = [
  "赵安",
  "林夏",
  "周越",
  "顾诚",
  "沈念",
  "许舟",
  "韩昭",
  "唐序",
  "陆清",
  "陈栖",
  "何简",
  "魏宁",
  "宋洵",
  "方澈",
  "叶知",
];

const directions = ["大盘复盘", "板块机会", "个股拆解", "情绪周期", "风险提醒"];
const formats = ["结论先行", "问答式", "案例拆解", "观点输出", "清单式"];
const topics = [
  "早盘情绪回暖，今天最该看的不是指数",
  "低吸总失败，问题往往不在选股",
  "板块龙头走弱后，第二梯队怎么接",
  "为什么同样讲热点，有人能冲到高播放",
  "今天这类内容容易掉完播，别再硬讲逻辑",
  "复盘里最容易被忽略的转化信号",
];

const baseDate = new Date();
baseDate.setUTCHours(0, 0, 0, 0);
export const DEMO_CURRENT_DATE = formatDate(baseDate);

export const demoProfiles: DemoProfile[] = profileNames.map((name, index) => ({
  id: `demo-profile-${String(index + 1).padStart(2, "0")}`,
  name,
  role: "member",
  status: index === 10 ? "exempt" : "active",
  permissions: {},
}));

export const demoAccounts: DemoAccount[] = demoProfiles.flatMap((profile, index) => {
  const baseAccount: DemoAccount = {
    id: `demo-account-${String(index + 1).padStart(2, "0")}`,
    profile_id: profile.id,
    name: `${profile.name}的数据号`,
    ownerName: profile.name,
    content_direction: pick(directions, index),
    presentation_format: pick(formats, index),
  };

  if (index === 0) {
    return [
      baseAccount,
      {
        ...baseAccount,
        id: "demo-account-16",
        name: `${profile.name}的直播切片号`,
        content_direction: "热点追踪",
        presentation_format: "故事引入",
      },
    ];
  }

  return [baseAccount];
});

const accountNameMap = new Map(demoAccounts.map((account) => [account.id, account.name]));
const accountOwnerMap = new Map(demoAccounts.map((account) => [account.id, account.ownerName]));

export const demoReports: DemoDailyReport[] = Array.from({ length: 30 }).flatMap((_, dayIndex) => {
  const reportDate = formatDate(shiftDays(baseDate, -dayIndex));

  return demoAccounts.map((account, accountIndex) => {
    const qualityBase = 0.75 + ((accountIndex % 5) * 0.08) + ((29 - dayIndex) * 0.008);
    const playCount = Math.round(48000 + accountIndex * 13500 + qualityBase * 42000 + (dayIndex % 6) * 3800);
    const likeRate = 2.2 + (accountIndex % 4) * 0.45;
    const commentRate = 0.28 + (accountIndex % 3) * 0.07;
    const shareRate = 0.18 + (accountIndex % 5) * 0.04;
    const favoriteRate = 0.3 + (accountIndex % 4) * 0.05;
    const followerRate = 0.06 + (accountIndex % 5) * 0.01;
    const completionRate5s = clamp(48 + (accountIndex % 6) * 4 - dayIndex * 0.2, 34, 78);
    const completionRate = clamp(28 + (accountIndex % 5) * 3.3 - dayIndex * 0.12, 18, 52);
    const publishedAt = new Date(`${reportDate}T0${(accountIndex % 8) + 8}:30:00.000Z`);
    const uploadedAt = new Date(`${reportDate}T1${(accountIndex % 7) + 2}:10:00.000Z`);
    const title = `${pick(topics, dayIndex + accountIndex)} ${String(dayIndex + 1).padStart(2, "0")}`;

    return {
      id: `demo-report-${account.id}-${reportDate}`,
      user_id: account.profile_id,
      account_id: account.id,
      report_date: reportDate,
      title,
      submitter: account.ownerName,
      play_count: playCount,
      completion_rate: percent(completionRate),
      avg_play_duration: `${Math.round(36 + (accountIndex % 4) * 5 + completionRate / 3)}秒`,
      bounce_rate_2s: percent(clamp(100 - completionRate5s + 8, 22, 68)),
      completion_rate_5s: percent(completionRate5s),
      likes: Math.round((playCount * likeRate) / 100),
      comments: Math.round((playCount * commentRate) / 100),
      shares: Math.round((playCount * shareRate) / 100),
      favorites: Math.round((playCount * favoriteRate) / 100),
      follower_gain: Math.round((playCount * followerRate) / 100),
      follower_convert: Math.round(playCount * 0.0035 + accountIndex * 8),
      content: `示例文案：${title}。先给结论，再给两组数据对比，最后补一句“主页有完整模板”。`,
      published_at: formatDateTime(publishedAt),
      uploaded_at: formatDateTime(uploadedAt),
    };
  });
});

export const demoLeaderboardRows: AccountLeaderboardRow[] = demoReports.map((report) => {
  const account = demoAccounts.find((item) => item.id === report.account_id)!;
  return {
    account_id: report.account_id,
    account_name: account.name,
    profile_id: account.profile_id,
    owner_name: account.ownerName,
    content_direction: account.content_direction,
    presentation_format: account.presentation_format,
    report_date: report.report_date,
    play_count: report.play_count,
    likes: report.likes,
    comments: report.comments,
    shares: report.shares,
    favorites: report.favorites,
    follower_gain: report.follower_gain,
    follower_convert: report.follower_convert,
    completion_rate: report.completion_rate,
    avg_play_duration: report.avg_play_duration,
    bounce_rate_2s: report.bounce_rate_2s,
    completion_rate_5s: report.completion_rate_5s,
  };
});

export const demoVideos: DemoVideoRow[] = demoReports
  .filter((_, index) => index % 3 === 0)
  .slice(0, 48)
  .map((report, index) => ({
    id: `demo-video-${String(index + 1).padStart(3, "0")}`,
    account_id: report.account_id,
    user_id: report.user_id,
    video_url: `https://example.com/demo-video-${index + 1}`,
    video_title: report.title,
    content: report.content,
    published_at: report.published_at,
    uploaded_at: report.uploaded_at,
    anomaly_status: index % 11 === 0 ? "限流" : index % 13 === 0 ? "未满24h" : "正常",
    created_at: report.uploaded_at,
    owner_name: accountOwnerMap.get(report.account_id) ?? report.submitter,
    account_name: accountNameMap.get(report.account_id) ?? "示例账号",
    content_direction: demoAccounts.find((account) => account.id === report.account_id)?.content_direction ?? null,
  }));

export const demoSnapshots: VideoMetricsSnapshot[] = demoVideos.map((video, index) => {
  const publishedDate = video.published_at?.slice(0, 10) ?? DEMO_CURRENT_DATE;
  const report = demoReports.find((item) => item.account_id === video.account_id && item.report_date === publishedDate) ?? demoReports[index];
  const playCount = report.play_count ?? 0;
  return {
    id: `demo-snapshot-${String(index + 1).padStart(3, "0")}`,
    video_id: video.id,
    snapshot_type: "24h",
    play_count: playCount,
    likes: report.likes,
    comments: report.comments,
    shares: report.shares,
    favorites: report.favorites,
    follower_gain: report.follower_gain,
    follower_loss: Math.round(report.follower_gain * 0.08),
    fan_play_ratio: 18 + (index % 4) * 2,
    homepage_visits: Math.round(playCount * 0.06),
    follower_convert: report.follower_convert,
    cover_click_rate: 9 + (index % 5) * 1.2,
    avg_play_duration: Number.parseFloat(report.avg_play_duration ?? "0"),
    completion_rate: Number.parseFloat(report.completion_rate ?? "0"),
    bounce_rate_2s: Number.parseFloat(report.bounce_rate_2s ?? "0"),
    completion_rate_5s: Number.parseFloat(report.completion_rate_5s ?? "0"),
    avg_play_ratio: 32 + (index % 5) * 2.1,
    vs_previous: null,
    screenshot_urls: null,
    curve_screenshot_url: null,
    retention_screenshot_url: null,
    captured_at: video.uploaded_at,
  };
});

export const demoVideoTags: VideoTag[] = demoVideos.flatMap((video, index) => [
  {
    id: `demo-tag-${video.id}-1`,
    video_id: video.id,
    tag_dimension: "题材",
    tag_value: video.content_direction ?? "大盘复盘",
    source: "ai",
    confidence: 0.92,
    reason: "演示数据按账号方向自动映射。",
    reviewed_by: null,
    created_at: video.uploaded_at,
  },
  {
    id: `demo-tag-${video.id}-2`,
    video_id: video.id,
    tag_dimension: "表达形式",
    tag_value: pick(["结论先行", "案例拆解", "观点输出", "问答式"], index),
    source: "ai",
    confidence: 0.88,
    reason: "演示数据按常见表达形式生成。",
    reviewed_by: null,
    created_at: video.uploaded_at,
  },
  {
    id: `demo-tag-${video.id}-3`,
    video_id: video.id,
    tag_dimension: "CTA类型",
    tag_value: pick(["看主页", "关注", "评论", "无明显CTA"], index),
    source: "manual",
    confidence: 0.81,
    reason: "演示环境只展示标签形态，不触发真实复核。",
    reviewed_by: null,
    created_at: video.uploaded_at,
  },
]);

export const demoMarketRows: MarketContextDaily[] = Array.from({ length: 30 }).map((_, index) => {
  const date = formatDate(shiftDays(baseDate, -index));
  const sentiment = pick(["强", "中", "弱"], index) as MarketContextDaily["market_sentiment"];

  return {
    id: `demo-market-${date}`,
    context_date: date,
    is_trading_day: index % 7 !== 0 && index % 7 !== 6,
    market_change: {
      shanghai: Number((0.8 - index * 0.03).toFixed(2)),
      chiNext: Number((1.2 - index * 0.04).toFixed(2)),
    },
    market_sentiment: sentiment,
    hot_sectors: [pick(["机器人", "券商", "AI 应用", "芯片", "高股息"], index), pick(["军工", "消费", "算力", "医药"], index + 1)],
    source: "demo-seed",
    updated_by: null,
    created_at: `${date}T08:00:00.000Z`,
  };
});

export const demoChannels = [
  {
    id: "demo-channel-1",
    name: "主通道 Claude",
    base_url: "https://api.example.com/claude",
    api_key_masked: "sk-dm***c1a2",
    model: "claude-sonnet-4-6",
    priority: 10,
    is_enabled: true,
    unhealthy_until: null,
    consecutive_failures: 0,
    last_failure_at: null,
    last_success_at: `${DEMO_CURRENT_DATE}T03:20:00.000Z`,
    last_error_message: null,
  },
  {
    id: "demo-channel-2",
    name: "备用通道 GPT",
    base_url: "https://api.example.com/openai",
    api_key_masked: "sk-dm***8d9e",
    model: "gpt-5.4-mini",
    priority: 20,
    is_enabled: true,
    unhealthy_until: `${DEMO_CURRENT_DATE}T12:30:00.000Z`,
    consecutive_failures: 3,
    last_failure_at: `${DEMO_CURRENT_DATE}T10:42:00.000Z`,
    last_success_at: `${DEMO_CURRENT_DATE}T07:10:00.000Z`,
    last_error_message: "429 rate limit",
  },
  {
    id: "demo-channel-3",
    name: "OCR 专用",
    base_url: "https://api.example.com/ocr",
    api_key_masked: "sk-dm***3f7h",
    model: "gemini-3-flash",
    priority: 30,
    is_enabled: false,
    unhealthy_until: null,
    consecutive_failures: 0,
    last_failure_at: null,
    last_success_at: `${DEMO_CURRENT_DATE}T02:00:00.000Z`,
    last_error_message: null,
  },
];

const demoFeatures: DemoFeatureRow[] = [
  {
    id: "demo-feature-1",
    feature_key: "growth_insight",
    label: "成长洞察",
    channel_name: "主通道 Claude",
    model: "claude-sonnet-4-6",
    is_enabled: true,
    updated_at: `${DEMO_CURRENT_DATE}T09:12:00.000Z`,
    system_prompt: "输出一句结论、两条证据、一条改写建议。",
  },
  {
    id: "demo-feature-2",
    feature_key: "growth_advice",
    label: "成长动作建议",
    channel_name: "主通道 Claude",
    model: "claude-sonnet-4-6",
    is_enabled: true,
    updated_at: `${DEMO_CURRENT_DATE}T09:15:00.000Z`,
    system_prompt: "优先给出能直接执行的两到三步。",
  },
  {
    id: "demo-feature-3",
    feature_key: "content_tools",
    label: "内容工具生成",
    channel_name: "备用通道 GPT",
    model: "gpt-5.4-mini",
    is_enabled: true,
    updated_at: `${DEMO_CURRENT_DATE}T09:18:00.000Z`,
    system_prompt: "先看近期爆款，再给选题与发布时间。",
  },
  {
    id: "demo-feature-4",
    feature_key: "ocr_screenshot",
    label: "截图识别",
    channel_name: "OCR 专用",
    model: "gemini-3-flash",
    is_enabled: false,
    updated_at: `${DEMO_CURRENT_DATE}T08:54:00.000Z`,
    system_prompt: "识别关键字段并给置信度。",
  },
  {
    id: "demo-feature-5",
    feature_key: "admin_assistant",
    label: "后台 AI 助手",
    channel_name: "主通道 Claude",
    model: "claude-sonnet-4-6",
    is_enabled: true,
    updated_at: `${DEMO_CURRENT_DATE}T09:22:00.000Z`,
    system_prompt: "先判断是否需要确认，再选择允许的后台动作。",
  },
  {
    id: "demo-feature-6",
    feature_key: "next_day_review",
    label: "次日复盘",
    channel_name: "备用通道 GPT",
    model: "gpt-5.4-mini",
    is_enabled: true,
    updated_at: `${DEMO_CURRENT_DATE}T08:40:00.000Z`,
    system_prompt: "关注掉点、亮点和可执行修正。",
  },
];

export const demoFeatureGroups = AI_FEATURE_GROUP_ORDER.map((group) => ({
  group,
  description: `${group} 的演示配置，保留开关、模型和渠道布局，但统一只读。`,
  features: demoFeatures
    .filter((feature) => getAiFeatureMetadata(feature.feature_key, feature.label).group === group)
    .map((feature) => ({
      ...feature,
      metadata: getAiFeatureMetadata(feature.feature_key, feature.label),
    })),
})).filter((section) => section.features.length > 0);

export const demoActionHistory: DemoActionHistory[] = [
  {
    id: "demo-action-1",
    adminName: "演示管理员",
    actionType: "query",
    description: "查最近三天谁未填报",
    result: "success",
    createdAt: `${DEMO_CURRENT_DATE}T09:06:00.000Z`,
  },
  {
    id: "demo-action-2",
    adminName: "演示管理员",
    actionType: "diagnosis",
    description: "分析赵安昨日视频掉点原因",
    result: "success",
    createdAt: `${DEMO_CURRENT_DATE}T09:18:00.000Z`,
  },
  {
    id: "demo-action-3",
    adminName: "演示管理员",
    actionType: "modify",
    description: "准备把林夏改成管理员",
    result: "pending_confirm",
    createdAt: `${DEMO_CURRENT_DATE}T09:25:00.000Z`,
  },
  {
    id: "demo-action-4",
    adminName: "演示管理员",
    actionType: "config_change",
    description: "调整 growth_insight 模型",
    result: "success",
    createdAt: `${DEMO_CURRENT_DATE}T09:41:00.000Z`,
  },
];

export const demoChatMessages = [
  {
    id: "demo-chat-1",
    role: "assistant" as const,
    content: "这里是演示版后台 AI 助手。你可以看到问答、确认卡片和历史结构，但不会触发真实写入。",
  },
  {
    id: "demo-chat-2",
    role: "user" as const,
    content: "查一下最近三天谁没填报",
  },
  {
    id: "demo-chat-3",
    role: "assistant" as const,
    content: "演示结果：最近三天共有 3 位成员出现断填，主要集中在周二与周四。正式环境里这里会继续给出具体名单和补救动作。",
  },
];

const myAccountIds = demoAccounts.filter((account) => account.profile_id === DEMO_VIEWER.focusProfileId).map((account) => account.id);
const myReports = demoReports.filter((report) => myAccountIds.includes(report.account_id));
const monthReports = demoReports as MetricsReport[];
const activeUserIds = demoProfiles.filter((profile) => profile.status === "active").map((profile) => profile.id);

export function getDemoDashboardPageData() {
  const todayReports = myReports.filter((report) => report.report_date === DEMO_CURRENT_DATE);
  const trendData = build个人趋势数据(myReports, monthReports, activeUserIds);
  const history = [...myReports].sort((left, right) => right.uploaded_at.localeCompare(left.uploaded_at)).slice(0, 12);

  return {
    today: DEMO_CURRENT_DATE,
    userId: DEMO_VIEWER.focusProfileId,
    userDisplayName: demoProfiles[0]?.name ?? "演示成员",
    accounts: demoAccounts.filter((account) => myAccountIds.includes(account.id)).map((account) => ({
      ...account,
      display_name: account.name,
    })),
    accountIds: myAccountIds,
    ownContentDirections: demoAccounts.filter((account) => myAccountIds.includes(account.id)).map((account) => account.content_direction ?? "").filter(Boolean),
    todayReports,
    history,
    leaderboardData: demoLeaderboardRows,
    trendData,
    summary: {
      totalAccounts: myAccountIds.length,
      submittedCount: todayReports.length,
      pendingCount: Math.max(myAccountIds.length - todayReports.length, 0),
      historyCount: history.length,
    },
  };
}

export function getDemoAnalyticsPageData() {
  const rangeFrom = formatDate(shiftDays(baseDate, -29));

  return {
    range: {
      from: rangeFrom,
      to: DEMO_CURRENT_DATE,
      preset: "30d" as const,
    },
    isPrivilegedUser: true,
    currentUserName: DEMO_VIEWER.name,
    submitters: demoProfiles.map((profile) => profile.name),
    filteredReports: demoReports,
    filteredVideos: demoVideos.map((video) => ({
      ...video,
      accounts: { name: video.account_name },
      profiles: { name: video.owner_name },
    })),
    filteredSnapshots: demoSnapshots,
    filteredVideoTags: demoVideoTags,
  };
}

export function getDemoGrowthPageData() {
  const myRecentReports = myReports.filter((report) => report.report_date >= formatDate(shiftDays(baseDate, -6)));
  const myPreviousReports = myReports.filter((report) => {
    const date = report.report_date;
    return date >= formatDate(shiftDays(baseDate, -13)) && date < formatDate(shiftDays(baseDate, -6));
  });

  const capabilityCards: GrowthDimensionCard[] = buildGrowthDimensionCards({
    myReports,
    teamReports: monthReports,
  });

  const weakestCards: WeakBenchmarkCard[] = [
    {
      dimension: "开头留人",
      state: "benchmark",
      headline: "同题材里，开头 5 秒承诺更直接的样本普遍更稳。",
      personName: "林夏",
      metricLabel: "5秒完播率",
      metricText: "66.4%",
      snippet: "第一句先交代收益点，再给一个反常识冲突，能明显减少前 3 秒流失。",
      historyTopSamples: [
        { id: "weak-1", title: "低吸节奏别看盘后榜单", metricText: "68.1%" },
        { id: "weak-2", title: "热点不追高的三条边界", metricText: "66.8%" },
      ],
    },
    {
      dimension: "增长转化",
      state: "benchmark",
      headline: "结尾 CTA 更明确的样本，导粉效率更高。",
      personName: "周越",
      metricLabel: "涨粉率",
      metricText: "0.12%",
      snippet: "结尾不讲空话，而是直接说“主页模板已整理好”，转化动作更清晰。",
      historyTopSamples: [
        { id: "weak-3", title: "短线选手最容易掉进的两个坑", metricText: "0.14%" },
        { id: "weak-4", title: "看懂竞价后的第一件事", metricText: "0.12%" },
      ],
    },
  ];

  const pkRows: GrowthPkRow[] = [
    { key: "play", label: "平均播放", leftValue: 128000, rightValue: 146000, leftText: "12.8万", rightText: "14.6万", gapPercent: -12.3, isDanger: true, insight: "对方更稳" },
    { key: "finish", label: "完播率", leftValue: 36.2, rightValue: 41.8, leftText: "36.2%", rightText: "41.8%", gapPercent: -13.4, isDanger: true, insight: "开头承诺不够强" },
    { key: "gain", label: "涨粉率", leftValue: 0.09, rightValue: 0.12, leftText: "0.09%", rightText: "0.12%", gapPercent: -25, isDanger: true, insight: "CTA 不够明确" },
  ];

  const scriptBreakdown: ScriptBreakdownData = {
    state: "structured",
    rawText: "你以为今天最值得讲的是指数，其实真正能放大收益的是板块轮动节奏。",
    placeholder: "",
    segments: [
      { id: "seg-1", label: "开头钩子", tone: "primary", segmentType: "hook", content: "先抛反常识结论，把注意力锁住。", startSec: 0, endSec: 4 },
      { id: "seg-2", label: "背景补充", tone: "neutral", segmentType: "background", content: "用 1 句盘面背景解释为什么今天不能只看指数。", startSec: 4, endSec: 9 },
      { id: "seg-3", label: "核心观点", tone: "success", segmentType: "core_point", content: "明确给出轮动节奏和应对动作。", startSec: 9, endSec: 18 },
      { id: "seg-4", label: "行动引导", tone: "danger", segmentType: "action_cta", content: "结尾直接引导去主页拿模板。", startSec: 18, endSec: 22 },
    ],
  };

  const advice: AdviceSections = {
    source: "rule",
    diagnosis: "最近 7 天你的问题不在选题，而在开头承诺不够狠，导致 5 秒留人掉得更快。",
    reference: "建议重点参考林夏这组“先结论后对比”的结构，开头先给收益点，再讲原因。",
    action: "下一条先改前 2 句：一句结论 + 一句冲突，再把 CTA 缩到最后 1 句。",
  };

  return {
    profileName: demoProfiles[0]?.name ?? "赵安",
    statusCards: buildStatusCards(myRecentReports, myPreviousReports) as StatusCardItem[],
    capabilityCards,
    weakBenchmarkCards: weakestCards,
    pkPanel: {
      leftName: demoProfiles[0]?.name ?? "赵安",
      rightName: "林夏",
      rows: pkRows,
    },
    scriptBreakdown,
    advice,
    summary: {
      hasEnoughData: true,
      weakestDimension: "开头留人",
    },
  };
}

export function getDemoAdminOverviewData() {
  const trendData = build团队趋势数据(monthReports, activeUserIds);
  const pendingMembers = demoProfiles.filter((profile) => profile.status === "exempt");

  return {
    queryDate: DEMO_CURRENT_DATE,
    trendData,
    summary: {
      totalProfiles: demoProfiles.length,
      activeProfilesCount: activeUserIds.length,
      exemptProfilesCount: pendingMembers.length,
      todayReportCount: demoReports.filter((report) => report.report_date === DEMO_CURRENT_DATE).length,
      pendingRequestCount: 3,
      inviteCodeCount: 24,
      latestLogAction: "演示模式：系统按只读方式展示",
    },
    memberRows: demoProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      status: profile.status,
      accountCount: demoAccounts.filter((account) => account.profile_id === profile.id).length,
      todaySubmitted: demoReports.some((report) => report.user_id === profile.id && report.report_date === DEMO_CURRENT_DATE),
    })),
    recentLogs: [
      { id: "log-1", actor: "演示管理员", action: "查看成员提交状态", createdAt: `${DEMO_CURRENT_DATE} 09:08` },
      { id: "log-2", actor: "演示管理员", action: "打开 AI 渠道管理", createdAt: `${DEMO_CURRENT_DATE} 09:15` },
      { id: "log-3", actor: "演示管理员", action: "查看内容管理待复盘队列", createdAt: `${DEMO_CURRENT_DATE} 09:27` },
    ],
    quickActions: [
      { label: "生成邀请码", description: "演示中保留入口，不触发真实创建。" },
      { label: "导出数据", description: "演示中保留按钮，但不导出任何真实文件。" },
      { label: "成员权限调整", description: "演示中展示结构，实际写入全部锁定。" },
    ],
  };
}

export function getDemoAdminContentData() {
  return {
    rows: demoVideos.slice(0, 16).map((video) => {
      const tags = demoVideoTags.filter((tag) => tag.video_id === video.id);
      const snapshot = demoSnapshots.find((item) => item.video_id === video.id);

      return {
        ...video,
        tags,
        snapshot,
      };
    }),
  };
}

export function getDemoAIAssistantData() {
  return {
    messages: demoChatMessages,
    history: demoActionHistory,
  };
}

export function getDemoAIChannelsData() {
  return demoChannels;
}

export function getDemoAIFeatureData() {
  return demoFeatureGroups;
}
