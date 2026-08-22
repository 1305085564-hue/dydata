/**
 * AI 默认模型兜底值。
 *
 * 业务语义：当环境变量 AI_MODEL 未配置、且渠道/调用方都没有显式指定模型时，
 * 最后的兜底模型；同时作为 model_name 写入 ai_insight_result 等审计记录。
 * 修改前需与阿禅确认成本影响。
 */
export const DEFAULT_AI_MODEL = "claude-sonnet-4-6";
