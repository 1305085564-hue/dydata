export type AiFeatureGroup =
  | "个人成长"
  | "内容工具"
  | "OCR/截图识别"
  | "后台 AI 助手"
  | "其他已有 AI 能力";

export type AiFeatureMetadata = {
  group: AiFeatureGroup;
  title: string;
  location: string;
  purpose: string;
  inputSummary: string;
  outputSummary: string;
  recommendedWhen: string;
};

export const AI_FEATURE_GROUP_ORDER: AiFeatureGroup[] = [
  "个人成长",
  "内容工具",
  "OCR/截图识别",
  "后台 AI 助手",
  "其他已有 AI 能力",
];

const FALLBACK_METADATA: AiFeatureMetadata = {
  group: "其他已有 AI 能力",
  title: "未分类 AI 功能",
  location: "待补充页面位置",
  purpose: "当前功能已接入 AI，但还没补清楚业务说明。",
  inputSummary: "看对应接口传入的数据。",
  outputSummary: "看对应接口返回的数据。",
  recommendedWhen: "先补充功能说明，再交给业务同学配置。",
};

export const AI_FEATURE_METADATA: Record<string, AiFeatureMetadata> = {
  growth_insight: {
    group: "个人成长",
    title: "个人成长：问题证据与改写建议",
    location: "/growth > AI 洞察与行动建议 > 一句话结论 / 问题证据 / 改写建议",
    purpose: "给昨天那条视频下一个短结论，点出问题证据，补一句归因，再给可直接替换的改写。",
    inputSummary: "昨日单条视频核心指标、文案原文、流量曲线描述、留存曲线描述。",
    outputSummary: "返回 diagnosis / scene / cause / rewrite 四段，分别服务结论、证据、归因、改写。",
    recommendedWhen: "想看问题到底出在哪一段，先配它。",
  },
  growth_advice: {
    group: "个人成长",
    title: "个人成长：参考示例与下一步动作",
    location: "/growth > AI 洞察与行动建议 > 参考示例 / 下一步动作",
    purpose: "基于近 7 天表现和标杆样本，告诉你该学谁、先改哪两三步。",
    inputSummary: "7 天汇总、五维诊断、最弱项、标杆数据、参考样本。",
    outputSummary: "返回 diagnosis / reference / action 三段，其中重点服务参考示例和下一步动作。",
    recommendedWhen: "问题已经知道了，想拿到可执行动作时用它。",
  },
  content_segment: {
    group: "个人成长",
    title: "个人成长：文案拆解",
    location: "/growth > 文案拆解",
    purpose: "把原始文案切成开头、铺垫、核心观点、行动引导这些段落，方便定位哪一段拖后腿。",
    inputSummary: "视频原始文案文本。",
    outputSummary: "结构化段落切分结果，供文案拆解区展示。",
    recommendedWhen: "要看问题发生在开头、中段还是结尾时用它。",
  },
  content_tools: {
    group: "内容工具",
    title: "内容工具生成",
    location: "/content-tools",
    purpose: "帮内容团队生成选题建议、模板库和发布时间建议。",
    inputSummary: "账号近期视频、爆款样本、标签分布、市场热点。",
    outputSummary: "按工具场景返回选题、模板结构或发布时间建议。",
    recommendedWhen: "内容策划要批量找方向、找模板时用它。",
  },
  ocr_screenshot: {
    group: "OCR/截图识别",
    title: "截图识别",
    location: "截图上传链路 / 数据图 / 流量曲线 / 留存曲线",
    purpose: "把截图里的关键数字和曲线特征识别出来，给后续诊断做输入。",
    inputSummary: "单张截图图片，可能是数据图、流量曲线图或留存曲线图。",
    outputSummary: "返回识别后的字段、曲线特征、置信度和是否需要人工确认。",
    recommendedWhen: "截图内容需要转成结构化数据时用它。",
  },
  admin_assistant: {
    group: "后台 AI 助手",
    title: "后台 AI 助手（已下线）",
    location: "已从主站下线",
    purpose: "历史后台 AI 管理助手能力，页面已从 DYData 主站删除。",
    inputSummary: "管理员消息、上下文、允许调用的工具列表。",
    outputSummary: "一句回复 + 工具名 + 参数 + 简短理由。",
    recommendedWhen: "当前不需要配置；如以后恢复，先重新评估产品入口。",
  },
  period_insight: {
    group: "其他已有 AI 能力",
    title: "周期洞察",
    location: "周报 / 月报 / 周期复盘",
    purpose: "总结某个周期里什么方向最好、什么方向最差、下一轮该押什么。",
    inputSummary: "周期聚合数据、标签表现、实验结果。",
    outputSummary: "最佳方向、最差方向、已验证实验、下一期重点。",
    recommendedWhen: "要做周复盘、月复盘时用它。",
  },
  single_video: {
    group: "其他已有 AI 能力",
    title: "单视频分析",
    location: "单视频复盘链路",
    purpose: "针对一条视频做更完整的结构化分析，给出核心问题和分段建议。",
    inputSummary: "单条视频指标、脚本片段、流失点证据。",
    outputSummary: "结论、核心问题、分段建议、证据、置信度。",
    recommendedWhen: "需要比 growth 快照更完整的单条复盘时用它。",
  },
  next_day_review: {
    group: "其他已有 AI 能力",
    title: "次日复盘",
    location: "后台批改台 / 次日复盘任务",
    purpose: "给内容团队产出次日复盘结果，方便继续跟进爆点和失误点。",
    inputSummary: "单条视频表现、切段结果、相关上下文。",
    outputSummary: "次日复盘洞察结果，写入后台任务链路。",
    recommendedWhen: "运营要批量追踪昨天内容表现时用它。",
  },
  content_analysis: {
    group: "其他已有 AI 能力",
    title: "内容内部分析",
    location: "/admin/content > 分析",
    purpose: "给管理者做内部复盘辅助，只沉淀分析结果，不创建反馈卡。",
    inputSummary: "单条作品信息、核心指标、上一条对比、30天基线、曲线观察和截图 URL。",
    outputSummary: "数据摘要、疑似阶段、指标证据、文案原因、异常点、可复用经验和反馈草稿。",
    recommendedWhen: "管理者需要先判断异常原因，再决定是否引用到员工反馈时用它。",
  },
  video_diagnose: {
    group: "其他已有 AI 能力",
    title: "视频诊断",
    location: "视频诊断接口 / 建议下发链路",
    purpose: "针对一条视频输出简短诊断、原因和后续动作。",
    inputSummary: "视频内容、标签、快照指标、留存分析、市场环境、历史基线。",
    outputSummary: "summary / reasons / actions，用于沉淀建议记录。",
    recommendedWhen: "需要把问题转成待执行建议时用它。",
  },
  video_tag: {
    group: "其他已有 AI 能力",
    title: "视频标签生成",
    location: "视频提交 / 标签生成链路",
    purpose: "根据视频文案自动生成分类标签（题材、表达形式、CTA 类型）。",
    inputSummary: "视频文案文本。",
    outputSummary: "JSON 格式的标签数组，包含 tag_dimension、tag_value、confidence、reason。",
    recommendedWhen: "需要为视频自动打标签时用它。",
  },
  ai_insight: {
    group: "其他已有 AI 能力",
    title: "AI 洞察",
    location: "AI 洞察接口",
    purpose: "基于团队数据生成简短洞察和建议。",
    inputSummary: "团队近 N 天日报数据汇总。",
    outputSummary: "3 条简短洞察，每条一句话。",
    recommendedWhen: "需要快速获取数据洞察时用它。",
  },
  report_insight: {
    group: "其他已有 AI 能力",
    title: "周报/月报洞察",
    location: "周报 / 月报生成链路",
    purpose: "为周报/月报生成 AI 洞察段落。",
    inputSummary: "周期内团队日报数据汇总。",
    outputSummary: "3 条简短洞察，附加到报告内容中。",
    recommendedWhen: "生成周报/月报时需要 AI 洞察段落时用它。",
  },
};

export type AiFeatureKey = keyof typeof AI_FEATURE_METADATA;
export const AI_FEATURE_KEYS = Object.keys(AI_FEATURE_METADATA) as AiFeatureKey[];

export function getAiFeatureMetadata(featureKey: string, fallbackLabel?: string): AiFeatureMetadata {
  const metadata = AI_FEATURE_METADATA[featureKey];
  if (metadata) return metadata;

  return {
    ...FALLBACK_METADATA,
    title: fallbackLabel?.trim() || FALLBACK_METADATA.title,
  };
}
