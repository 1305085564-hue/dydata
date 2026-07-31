export type AiFeatureRouting = "binding" | "rewrite" | "system";
export type AiFeatureGroup = "business" | "rewrite" | "system";

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
  { key: "period_insight", label: "周期洞察", description: "周报与月报洞察", routing: "binding", group: "business" },
  { key: "next_day_review", label: "次日复盘", description: "批改台的次日复盘", routing: "binding", group: "business" },
  { key: "content_analysis", label: "内容分析", description: "内容分析服务", routing: "binding", group: "business" },
  { key: "video_tag", label: "视频标签", description: "视频提交时的标签生成", routing: "binding", group: "business" },
  { key: "content_segment", label: "文案拆解", description: "内容分段与文案拆解", routing: "binding", group: "business" },
  { key: "member_ai_suggestion", label: "成员建议", description: "后台成员管理建议", routing: "binding", group: "business" },
  { key: "sample_quality_check", label: "样本质检", description: "仪表盘样本质量检查", routing: "binding", group: "business" },
  { key: "ocr_screenshot", label: "截图识别", description: "首页日报截图识别与指标回填", routing: "binding", group: "business" },
  { key: "content_rewrite", label: "文案改写", description: "模型由改写模式路由统一决定", routing: "rewrite", group: "rewrite" },
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
  };
}

export function resolveAiFeatureAccess(featureKey: string) {
  const entry = getAiFeatureCatalogEntry(featureKey);
  if (!entry) {
    return { allowed: false, reason: `未注册的 AI 功能：${featureKey}` };
  }
  if (entry.routing === "rewrite") {
    return { allowed: false, reason: "文案改写必须通过改写模式路由调用" };
  }
  if (entry.routing === "system") {
    return { allowed: false, reason: "旧默认配置不是可调用的 AI 功能" };
  }
  return { allowed: true };
}
