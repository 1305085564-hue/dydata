/** 历史记录不是只有“可编辑/不可编辑”两种状态，而是按可安全完成的能力分层。 */
export type HistoryDataCapability =
  | "complete_editable"
  | "editable_without_attachments"
  | "partial_editable"
  | "read_only_missing_required_data"
  | "needs_manual_repair";

export type HistoryDataShape = {
  hasBoundVideo: boolean;
  hasExactlyOne24hSnapshot: boolean;
  hasRequiredMetrics: boolean;
  hasCompleteAttachments: boolean;
  hasOcrDetails: boolean;
  hasContent: boolean;
  hasUniqueUsageRecord: boolean;
  hasConsistentRelations: boolean;
};

export type HistoryDataClassification = {
  capability: HistoryDataCapability;
  editable: boolean;
  reason: string;
};

export function classifyHistoryData(shape: HistoryDataShape): HistoryDataClassification {
  if (!shape.hasConsistentRelations || !shape.hasExactlyOne24hSnapshot) {
    return {
      capability: "needs_manual_repair",
      editable: false,
      reason: "视频、日报或24h快照关系不唯一/不一致",
    };
  }

  if (!shape.hasBoundVideo) {
    return {
      capability: "read_only_missing_required_data",
      editable: false,
      reason: "日报没有绑定视频，只能编辑日报侧字段",
    };
  }

  if (!shape.hasRequiredMetrics || !shape.hasContent) {
    return {
      capability: "read_only_missing_required_data",
      editable: false,
      reason: "缺少编辑后会覆盖原记录的关键字段",
    };
  }

  if (!shape.hasUniqueUsageRecord) {
    return {
      capability: "needs_manual_repair",
      editable: false,
      reason: "导粉话术使用记录不唯一，无法安全保存",
    };
  }

  if (shape.hasCompleteAttachments && shape.hasOcrDetails) {
    return {
      capability: "complete_editable",
      editable: true,
      reason: "视频、指标、附属证据和关联关系完整",
    };
  }

  if (!shape.hasCompleteAttachments && !shape.hasOcrDetails) {
    return {
      capability: "editable_without_attachments",
      editable: true,
      reason: "核心字段可安全编辑，但缺少截图或 OCR 附属证据",
    };
  }

  return {
    capability: "partial_editable",
    editable: true,
    reason: "核心字段可编辑，但附属证据不完整",
  };
}
