import type { VideoPunishType } from "@/lib/video-anomaly";

type QueryError = { code?: unknown; message?: unknown } | null;

type ViolationCaseTable = {
  select: (columns: string) => {
    eq: (column: string, value: unknown) => {
      maybeSingle: () => Promise<{ data: { id?: unknown } | null; error: QueryError }>;
    };
  };
  insert: (payload: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => Promise<{ data: { id?: unknown } | null; error: QueryError }>;
    };
  };
};

export type AbnormalVideoCaseClient = {
  from: (table: string) => unknown;
};

export type AbnormalVideoCaseInput = {
  videoId: string;
  submitterId: string;
  accountId: string;
  accountName: string | null;
  teamId: string | null;
  anomalyStatus: string;
  punishType: VideoPunishType | null;
  platformNotice: string | null;
  appeal: string | null;
  scriptText: string;
  screenshotPaths: string[];
  videoUrl: string | null;
  videoTitle: string | null;
};

export type AbnormalVideoCaseSyncResult =
  | { status: "skipped_normal" }
  | { status: "created"; caseId: string }
  | { status: "already_exists"; caseId: string | null }
  | { status: "failed"; error: string };

function mapRiskLevel(punishType: VideoPunishType | null) {
  switch (punishType) {
    case "deleted":
      return "high";
    case "limited":
      return "medium";
    case "paid_boost":
    case "campaign_intervention":
    case "other":
    case null:
      return "low";
  }
}

function errorMessage(error: QueryError, fallback: string) {
  return error && typeof error.message === "string" && error.message
    ? error.message
    : fallback;
}

function isUniqueConstraintError(error: QueryError) {
  return Boolean(error && error.code === "23505");
}

export async function syncAbnormalVideoCase({
  supabase,
  input,
}: {
  supabase: AbnormalVideoCaseClient;
  input: AbnormalVideoCaseInput;
}): Promise<AbnormalVideoCaseSyncResult> {
  if (input.anomalyStatus !== "abnormal") {
    return { status: "skipped_normal" };
  }

  const cases = supabase.from("violation_cases") as ViolationCaseTable;
  const { data: existingCase, error: existingCaseError } = await cases
    .select("id")
    .eq("source_video_id", input.videoId)
    .maybeSingle();

  if (existingCaseError) {
    return { status: "failed", error: errorMessage(existingCaseError, "查询已有避坑案例失败") };
  }

  if (existingCase?.id && typeof existingCase.id === "string") {
    return { status: "already_exists", caseId: existingCase.id };
  }

  const { data: createdCase, error: insertError } = await cases
    .insert({
      source_video_id: input.videoId,
      submitted_by: input.submitterId,
      script_text: input.scriptText,
      is_violation: true,
      category: "短视频",
      account_id: input.accountId,
      account_name_snapshot: input.accountName,
      team_id: input.teamId,
      screenshot_paths: input.screenshotPaths,
      status: "submitted",
      is_deleted: false,
      risk_level: mapRiskLevel(input.punishType),
      purpose: "violation",
      platforms: ["抖音"],
      source_metadata: {
        source: "dashboard_video_submit",
        punish_type: input.punishType,
        platform_notice: input.platformNotice,
        appeal: input.appeal,
        video_url: input.videoUrl,
        video_title: input.videoTitle,
      },
    })
    .select("id")
    .single();

  if (isUniqueConstraintError(insertError)) {
    return { status: "already_exists", caseId: null };
  }

  if (insertError || !createdCase?.id || typeof createdCase.id !== "string") {
    return { status: "failed", error: errorMessage(insertError, "创建待审核避坑案例失败") };
  }

  return { status: "created", caseId: createdCase.id };
}
