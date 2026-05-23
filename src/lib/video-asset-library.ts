import type { VideoAssetLevel, VideoAssetLibraryRecord, VideoAssetMissingField } from "@/types";

type BuildVideoAssetRecordInput = {
  videoId: string;
  videoTitle: string | null | undefined;
  content: string | null | undefined;
  hasSnapshot24h: boolean;
  tagCount: number;
  segmentCount: number;
  assetLevel: VideoAssetLevel | null | undefined;
  assetNote: string | null | undefined;
  assetReviewedAt: string | null | undefined;
  assetReviewedBy: string | null | undefined;
};

const REQUIRED_FIELDS: Array<{
  key: VideoAssetMissingField;
  present: (input: BuildVideoAssetRecordInput) => boolean;
}> = [
  {
    key: "video_title",
    present: (input) => Boolean(input.videoTitle?.trim()),
  },
  {
    key: "content",
    present: (input) => Boolean(input.content?.trim()),
  },
  {
    key: "snapshot_24h",
    present: (input) => input.hasSnapshot24h,
  },
  {
    key: "video_tags",
    present: (input) => input.tagCount > 0,
  },
  {
    key: "content_segments",
    present: (input) => input.segmentCount > 0,
  },
];

function getCompletenessLabel(status: VideoAssetLibraryRecord["completeness_status"]) {
  if (status === "complete") return "资料完整";
  if (status === "partial") return "资料待补";
  return "资料缺失";
}

function getLibraryLabel(status: VideoAssetLibraryRecord["library_status"]) {
  return status === "ready" ? "已入库" : "待整理";
}

export function buildVideoAssetRecord(input: BuildVideoAssetRecordInput): VideoAssetLibraryRecord {
  const missingFields = REQUIRED_FIELDS.filter((field) => !field.present(input)).map((field) => field.key);
  const completedCount = REQUIRED_FIELDS.length - missingFields.length;
  const completionRatio = Number((completedCount / REQUIRED_FIELDS.length).toFixed(2));
  const completenessStatus =
    missingFields.length === 0 ? "complete" : completedCount >= 3 ? "partial" : "missing";
  const normalizedLevel = input.assetLevel ?? null;
  const libraryStatus = completenessStatus === "complete" && normalizedLevel ? "ready" : "pending";

  return {
    video_id: input.videoId,
    completeness_status: completenessStatus,
    completeness_label: getCompletenessLabel(completenessStatus),
    library_status: libraryStatus,
    library_status_label: getLibraryLabel(libraryStatus),
    completion_ratio: completionRatio,
    missing_fields: missingFields,
    asset_level: normalizedLevel,
    asset_note: input.assetNote?.trim() || null,
    asset_reviewed_at: input.assetReviewedAt ?? null,
    asset_reviewed_by: input.assetReviewedBy ?? null,
  };
}

export function isVideoAssetReady(record: Pick<VideoAssetLibraryRecord, "library_status">) {
  return record.library_status === "ready";
}
