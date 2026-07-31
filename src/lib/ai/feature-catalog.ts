export type AiFeatureRouting = "binding" | "rewrite" | "system";
export type AiFeatureGroup = "business" | "rewrite" | "review" | "archived" | "system";

export type AiFeatureCatalogEntry = {
  key: string;
  label: string;
  description: string;
  routing: AiFeatureRouting;
  group: AiFeatureGroup;
};

// This is the only list the control centre and runtime are allowed to use.
// Adding a new AI capability requires a code entry here before it can be configured.
const AI_FEATURE_CATALOG: readonly AiFeatureCatalogEntry[] = [
  { key: "content_tools", label: "内容工具", description: "内容工具内的 AI 生成与建议", routing: "binding", group: "business" },
  { key: "single_video", label: "单视频分析", description: "单条视频的 AI 分析", routing: "binding", group: "business" },
  { key: "period_insight", label: "周期洞察", description: "周报与月报洞察", routing: "binding", group: "business" },
  { key: "growth_insight", label: "成长诊断", description: "成长页面的 AI 诊断", routing: "binding", group: "business" },
  { key: "next_day_review", label: "次日复盘", description: "批改台的次日复盘", routing: "binding", group: "business" },
  { key: "content_analysis", label: "内容分析", description: "内容分析服务", routing: "binding", group: "business" },
  { key: "video_tag", label: "视频标签", description: "视频提交时的标签生成", routing: "binding", group: "business" },
  { key: "content_segment", label: "文案拆解", description: "内容分段与文案拆解", routing: "binding", group: "business" },
  { key: "member_ai_suggestion", label: "成员建议", description: "后台成员管理建议", routing: "binding", group: "business" },
  { key: "sample_quality_check", label: "样本质检", description: "仪表盘样本质量检查", routing: "binding", group: "business" },
  { key: "content_rewrite", label: "文案改写", description: "模型由改写模式路由统一决定", routing: "rewrite", group: "rewrite" },
  { key: "ocr_screenshot", label: "截图识别", description: "需确认现网截图入口是否仍在使用", routing: "binding", group: "review" },
  { key: "report_insight", label: "报告洞察", description: "需确认定时任务是否仍在运行", routing: "binding", group: "review" },
  { key: "ai_insight", label: "旧版 AI 洞察", description: "需确认旧接口是否仍有外部调用", routing: "binding", group: "review" },
  { key: "smart_alert", label: "智能预警", description: "当前由规则计算完成，不调用 AI", routing: "binding", group: "archived" },
  { key: "growth_advice", label: "成长建议", description: "没有线上调用入口", routing: "binding", group: "archived" },
  { key: "video_diagnose", label: "视频诊断", description: "没有线上调用入口", routing: "binding", group: "archived" },
  { key: "admin_assistant", label: "AI 管理助手", description: "没有线上调用入口", routing: "binding", group: "archived" },
  { key: "feishu_fulfillment_reminder", label: "飞书自动催交旧配置", description: "真实开关位于履约系统设置，不属于 AI 功能", routing: "system", group: "archived" },
  { key: "default", label: "旧默认配置", description: "不是业务功能，不参与场景路由", routing: "system", group: "system" },
] as const;

const catalogByKey = new Map(AI_FEATURE_CATALOG.map((entry) => [entry.key, entry]));

export function getAiFeatureCatalogEntry(featureKey: string) {
  return catalogByKey.get(featureKey) ?? null;
}

export function getAiFeatureCatalogGroups() {
  return {
    business: AI_FEATURE_CATALOG.filter((entry) => entry.group === "business"),
    rewrite: AI_FEATURE_CATALOG.filter((entry) => entry.group === "rewrite"),
    review: AI_FEATURE_CATALOG.filter((entry) => entry.group === "review"),
    archived: AI_FEATURE_CATALOG.filter((entry) => entry.group === "archived"),
  };
}

export function resolveAiFeatureAccess(featureKey: string) {
  const entry = getAiFeatureCatalogEntry(featureKey);
  if (!entry) {
    return { allowed: false, reason: `未注册的 AI 功能：${featureKey}` };
  }
  if (entry.group === "archived") {
    return { allowed: false, reason: `${entry.label}已归档，不能再调用 AI` };
  }
  if (entry.routing === "rewrite") {
    return { allowed: false, reason: "文案改写必须通过改写模式路由调用" };
  }
  if (entry.routing === "system") {
    return { allowed: false, reason: "旧默认配置不是可调用的 AI 功能" };
  }
  return { allowed: true };
}
