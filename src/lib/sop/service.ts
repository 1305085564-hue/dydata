import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveBusinessRole, type BusinessGroup } from "@/lib/business-role";
import { getShanghaiDateString, shiftDateString } from "@/lib/remind-submission";
import {
  SOP_CHECKPOINT_DEADLINES,
  SOP_CHECKPOINT_LABELS,
  SOP_REVIEW_CHECKPOINTS,
  applyCheckpointStatus,
  buildReviewDecision,
  canAccessSopManagementView,
  canReadGroupSop,
  canReadSopStatus,
  canReviewCheckpoint,
  canSubmitOwnCheckpoint,
  canTransitionCheckpointStatus,
  type SopProfileAccess,
} from "@/lib/sop/core";
import type {
  SopCheckpoint,
  SopCheckpointStatus,
  SopCheckpointSubmission,
  SopDailyStatus,
  SopMemberStatus,
  SopReviewScores,
  UserRole,
} from "@/types";

type SupabaseService = ReturnType<typeof createAdminClient>;

interface ProfileRow {
  id: string;
  name: string;
  role: UserRole;
  permissions?: Record<string, boolean> | null;
  status?: string | null;
  exempt_type?: "permanent" | "temporary" | null;
  exempt_start_date?: string | null;
  exempt_end_date?: string | null;
  exempt_reason?: string | null;
  exemption_category?: string | null;
  team_id: string | null;
  group_id: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  team_id: string | null;
  leader_user_id: string | null;
}

interface DailyReportMetricRow {
  user_id: string | null;
  report_date: string;
  play_count: number | null;
  likes: number | null;
}

interface LeaderDailyReportRow {
  id: string;
  leader_user_id: string;
  group_id: string;
  report_date: string;
  topic_feedback: string | null;
  opening_feedback: string | null;
  script_feedback: string | null;
  video_feedback: string | null;
  submitted_at: string | null;
  updated_at: string | null;
}

export type SopAlertType = "OVERDUE_CHECKPOINT" | "MISSING_DAILY_REPORT" | "DECLINING_PLAY_COUNT";

export interface SopAlert {
  id: string;
  type: SopAlertType;
  severity: "warning" | "critical";
  userId: string;
  userName: string;
  groupId: string | null;
  statusDate: string;
  checkpoint?: SopCheckpoint;
  checkpointLabel?: string;
  message: string;
  detail?: Record<string, unknown>;
}

const STATUS_COLUMNS: Record<SopCheckpoint, keyof Pick<
  SopDailyStatus,
  "data_report_status" | "morning_review_status" | "topic_status" | "script_status" | "video_status"
>> = {
  DATA_REPORT: "data_report_status",
  MORNING_REVIEW: "morning_review_status",
  TOPIC: "topic_status",
  SCRIPT: "script_status",
  VIDEO: "video_status",
};

const DEFAULT_STATUSES: Record<SopCheckpoint, SopCheckpointStatus> = {
  DATA_REPORT: "IDLE",
  MORNING_REVIEW: "IDLE",
  TOPIC: "IDLE",
  SCRIPT: "IDLE",
  VIDEO: "IDLE",
};

const SUBMITTED_STATUSES = new Set<SopCheckpointStatus>(["SUBMITTED", "APPROVED"]);
const PROFILE_SELECT =
  "id, name, role, permissions, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category, team_id, group_id";
const LEGACY_PROFILE_SELECT =
  "id, name, role, permissions, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category";

let profileTeamColumnsAvailable: boolean | null = null;

function todayIso() {
  return getShanghaiDateString();
}

function nowIso() {
  return new Date().toISOString();
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statusMap(row: SopDailyStatus): Record<SopCheckpoint, SopCheckpointStatus> {
  return {
    DATA_REPORT: row.data_report_status,
    MORNING_REVIEW: row.morning_review_status,
    TOPIC: row.topic_status,
    SCRIPT: row.script_status,
    VIDEO: row.video_status,
  };
}

function toMemberStatus(
  profile: Pick<ProfileRow, "id" | "name" | "team_id" | "group_id">,
  status: SopDailyStatus,
  submissions: SopCheckpointSubmission[],
): SopMemberStatus {
  return {
    userId: profile.id,
    userName: profile.name,
    teamId: profile.team_id,
    groupId: profile.group_id,
    statusDate: status.status_date,
    statuses: statusMap(status),
    currentBlocker: status.current_blocker,
    isOverdue: status.is_overdue,
    submissions,
  };
}

function isActiveMember(profile: ProfileRow) {
  return profile.role === "member";
}

function isDateExempt(profile: ProfileRow, date: string) {
  if (profile.status !== "exempt" && !profile.exempt_type) return false;
  if (profile.exempt_type === "permanent") return true;
  if (profile.exempt_type !== "temporary") return false;
  if (!profile.exempt_start_date || !profile.exempt_end_date) return false;
  return profile.exempt_start_date <= date && date <= profile.exempt_end_date;
}

function hasDeadlinePassed(statusDate: string, checkpoint: SopCheckpoint, now = new Date()) {
  const today = getShanghaiDateString(now);
  if (statusDate < today) return true;
  if (statusDate > today) return false;

  const timeText = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return timeText >= SOP_CHECKPOINT_DEADLINES[checkpoint];
}

function isPendingForOverdue(status: SopCheckpointStatus) {
  return status === "IDLE" || status === "PENDING" || status === "OVERDUE";
}

function isMissingProfileTeamColumnsError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message &&
      (error.message.includes("profiles.team_id") ||
        error.message.includes("profiles.group_id") ||
        error.message.includes("column profiles.team_id does not exist") ||
        error.message.includes("column profiles.group_id does not exist") ||
        error.message.includes("Could not find the 'team_id' column of 'profiles'") ||
        error.message.includes("Could not find the 'group_id' column of 'profiles'")),
  );
}

function isNoProfileRowError(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error?.code === "PGRST116" || error?.message?.includes("JSON object requested"));
}

function withProfileTeamFallback(row: Omit<ProfileRow, "team_id" | "group_id"> & Partial<Pick<ProfileRow, "team_id" | "group_id">>) {
  return {
    ...row,
    team_id: row.team_id ?? null,
    group_id: row.group_id ?? null,
  } as ProfileRow;
}

function normalizeSubmissionPayload(input: {
  checkpoint: SopCheckpoint;
  topicText?: string | null;
  scriptText?: string | null;
  videoUrl?: string | null;
  notes?: string | null;
}) {
  return {
    topic_text: input.checkpoint === "TOPIC" ? input.topicText?.trim() || null : null,
    script_text: input.checkpoint === "SCRIPT" ? input.scriptText?.trim() || null : null,
    video_url: input.checkpoint === "VIDEO" ? input.videoUrl?.trim() || null : null,
    notes: input.notes?.trim() || null,
  };
}

function validateSubmissionContent(input: {
  checkpoint: SopCheckpoint;
  topicText?: string | null;
  scriptText?: string | null;
  videoUrl?: string | null;
}) {
  if (input.checkpoint === "TOPIC" && !input.topicText?.trim()) throw new Error("选题内容不能为空");
  if (input.checkpoint === "SCRIPT" && !input.scriptText?.trim()) throw new Error("文案内容不能为空");
  if (input.checkpoint === "VIDEO" && !input.videoUrl?.trim()) throw new Error("视频链接不能为空");
}

function scoreFromStatus(status: "APPROVED" | "REJECTED"): SopReviewScores {
  const score = status === "APPROVED" ? 10 : 0;
  return {
    HOOK: score,
    VIEWPOINT: score,
    COMPLIANCE: score,
    PERFORMANCE_HOOK: score,
    YESTERDAY_REVIEW: score,
    CTA: score,
  };
}

async function getCurrentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function getProfile(service: SupabaseService, userId: string) {
  const query = (select: string) => service.from("profiles").select(select).eq("id", userId).single();
  const primary = profileTeamColumnsAvailable === false ? null : await query(PROFILE_SELECT);

  if (primary && !isMissingProfileTeamColumnsError(primary.error)) {
    profileTeamColumnsAvailable = true;
    const primaryError = primary.error as { code?: string; message?: string } | null;
    if (isNoProfileRowError(primaryError)) throw new Error("用户不存在");
    if (primaryError) throw new Error(primaryError.message ?? "资料查询失败");
    if (!primary.data) throw new Error("用户不存在");
    return withProfileTeamFallback(primary.data as unknown as ProfileRow);
  }

  profileTeamColumnsAvailable = false;
  const { data, error } = await query(LEGACY_PROFILE_SELECT);
  const profileError = error as { code?: string; message?: string } | null;
  if (isNoProfileRowError(profileError)) throw new Error("用户不存在");
  if (profileError) throw new Error(profileError.message ?? "资料查询失败");
  if (!data) throw new Error("用户不存在");
  return withProfileTeamFallback(data as unknown as Omit<ProfileRow, "team_id" | "group_id">);
}

async function getActor(service: SupabaseService, userId: string): Promise<SopProfileAccess> {
  const profile = await getProfile(service, userId);
  const { data, error } = await service.from("groups").select("id, team_id, leader_user_id").eq("leader_user_id", userId);

  if (error) throw new Error(error.message);
  const ledGroups = (data ?? []) as BusinessGroup[];

  return {
    userId: profile.id,
    role: profile.role,
    businessRole: resolveBusinessRole(
      {
        id: profile.id,
        role: profile.role,
        permissions: profile.permissions ?? {},
        team_id: profile.team_id,
        group_id: profile.group_id,
      },
      ledGroups,
    ),
    teamId: profile.team_id,
    groupId: profile.group_id,
    ledGroupIds: ledGroups.map((row) => row.id),
  };
}

async function requireActor(service: SupabaseService) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("请先登录");
  return getActor(service, userId);
}

async function ensureDailyStatus(service: SupabaseService, profile: ProfileRow, statusDate: string) {
  const draft = {
    user_id: profile.id,
    team_id: profile.team_id,
    group_id: profile.group_id,
    status_date: statusDate,
    current_blocker: "DATA_REPORT" as const,
  };

  // 尝试插入，冲突时忽略（绝不覆盖已有状态行）
  const { error: insertError } = await service.from("sop_daily_status").insert(draft);
  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message);
  }

  // 查询真实行返回（无论是刚插入的还是已存在的）
  const { data, error } = await service
    .from("sop_daily_status")
    .select("*")
    .eq("user_id", profile.id)
    .eq("status_date", statusDate)
    .single();

  if (error) throw new Error(error.message);
  return data as SopDailyStatus;
}

async function getSubmissions(service: SupabaseService, userIds: string[], statusDate: string) {
  if (userIds.length === 0) return [] as SopCheckpointSubmission[];

  const { data, error } = await service
    .from("sop_checkpoint_submissions")
    .select("*")
    .in("user_id", userIds)
    .eq("status_date", statusDate)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SopCheckpointSubmission[];
}

async function listMemberProfiles(
  service: SupabaseService,
  options: { groupIds?: string[] | null; teamId?: string | null } = {},
) {
  const buildQuery = (select: string) => {
    let query = service.from("profiles").select(select).eq("role", "member").order("name", { ascending: true });

    if (options.groupIds?.length === 1) query = query.eq("group_id", options.groupIds[0]);
    if (options.groupIds && options.groupIds.length > 1) query = query.in("group_id", options.groupIds);
    if ((!options.groupIds || options.groupIds.length === 0) && options.teamId) query = query.eq("team_id", options.teamId);
    return query;
  };

  const primary = profileTeamColumnsAvailable === false ? null : await buildQuery(PROFILE_SELECT);

  if (primary && !isMissingProfileTeamColumnsError(primary.error)) {
    profileTeamColumnsAvailable = true;
    if (primary.error) throw new Error(primary.error.message);
    return ((primary.data ?? []) as unknown as ProfileRow[]).map(withProfileTeamFallback).filter(isActiveMember);
  }

  profileTeamColumnsAvailable = false;
  if ((options.groupIds && options.groupIds.length > 0) || options.teamId) return [];

  const { data, error } = await buildQuery(LEGACY_PROFILE_SELECT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Omit<ProfileRow, "team_id" | "group_id">>).map(withProfileTeamFallback).filter(isActiveMember);
}

async function listGroups(service: SupabaseService, groupIds?: string[] | null) {
  let query = service.from("groups").select("id, name, team_id, leader_user_id").order("name", { ascending: true });

  if (groupIds?.length === 1) query = query.eq("id", groupIds[0]);
  if (groupIds && groupIds.length > 1) query = query.in("id", groupIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as GroupRow[];
}

async function updateDailyCheckpoint(
  service: SupabaseService,
  status: SopDailyStatus,
  checkpoint: SopCheckpoint,
  nextStatus: SopCheckpointStatus,
  options: { system?: boolean } = {},
) {
  const currentStatus = statusMap(status)[checkpoint];

  if (!options.system && !canTransitionCheckpointStatus(currentStatus, nextStatus)) {
    throw new Error(`状态不能从 ${currentStatus} 直接更新为 ${nextStatus}`);
  }

  const next = applyCheckpointStatus(statusMap(status), checkpoint, nextStatus);
  const column = STATUS_COLUMNS[checkpoint];
  const { data, error } = await service
    .from("sop_daily_status")
    .update({
      [column]: nextStatus,
      current_blocker: next.currentBlocker,
      is_overdue: next.isOverdue,
      updated_at: nowIso(),
    })
    .eq("id", status.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as SopDailyStatus;
}

async function transitionDailyCheckpoint(
  service: SupabaseService,
  status: SopDailyStatus,
  checkpoint: SopCheckpoint,
  finalStatus: SopCheckpointStatus,
  options: { system?: boolean } = {},
) {
  const currentStatus = statusMap(status)[checkpoint];

  if (currentStatus === finalStatus) return status;

  return updateDailyCheckpoint(service, status, checkpoint, finalStatus, options);
}

async function loadStatusesForProfiles(service: SupabaseService, profiles: ProfileRow[], statusDate: string) {
  if (profiles.length === 0) return [];

  const userIds = profiles.map((p) => p.id);

  // 1. 一次性查询所有已存在的状态行
  const { data: existingStatuses, error: selectError } = await service
    .from("sop_daily_status")
    .select("*")
    .in("user_id", userIds)
    .eq("status_date", statusDate);

  if (selectError) throw new Error(selectError.message);

  const statusByUserId = new Map<string, SopDailyStatus>(
    (existingStatuses ?? []).map((s) => [s.user_id, s as SopDailyStatus]),
  );

  // 2. 找出缺失的 profile，批量 upsert（冲突时忽略，绝不覆盖已有状态）
  const missing = profiles.filter((p) => !statusByUserId.has(p.id));
  if (missing.length > 0) {
    const drafts = missing.map((profile) => ({
      user_id: profile.id,
      team_id: profile.team_id,
      group_id: profile.group_id,
      status_date: statusDate,
      current_blocker: "DATA_REPORT" as const,
    }));

    const { error: upsertError } = await service
      .from("sop_daily_status")
      .upsert(drafts, { onConflict: "user_id,status_date", ignoreDuplicates: true });

    if (upsertError) throw new Error(upsertError.message);

    // ignoreDuplicates 不返回已有行，需要再查一次补全 Map
    const { data: refetched, error: refetchError } = await service
      .from("sop_daily_status")
      .select("*")
      .in("user_id", missing.map((p) => p.id))
      .eq("status_date", statusDate);

    if (refetchError) throw new Error(refetchError.message);
    (refetched ?? []).forEach((s) => statusByUserId.set(s.user_id, s as SopDailyStatus));
  }

  // 3. 确保所有 profile 都有状态行
  const stillMissing = profiles.filter((p) => !statusByUserId.has(p.id));
  if (stillMissing.length > 0) {
    throw new Error(`卡点状态初始化失败: ${stillMissing.map((p) => p.name).join(", ")}`);
  }

  // 4. 一次性查询所有 submissions，按 user_id 分组到 Map
  const submissions = await getSubmissions(service, userIds, statusDate);
  const submissionsByUserId = new Map<string, SopCheckpointSubmission[]>();
  for (const sub of submissions) {
    const arr = submissionsByUserId.get(sub.user_id) ?? [];
    arr.push(sub);
    submissionsByUserId.set(sub.user_id, arr);
  }

  // 5. 组装结果（不用循环里反复 find/filter）
  return profiles.map((profile) => {
    const status = statusByUserId.get(profile.id)!;
    return toMemberStatus(profile, status, submissionsByUserId.get(profile.id) ?? []);
  });
}

function resolveActorGroupIds(actor: SopProfileAccess) {
  const ownAdminGroup = actor.role === "admin" && actor.groupId ? [actor.groupId] : [];
  return Array.from(new Set([...ownAdminGroup, ...actor.ledGroupIds]));
}

async function requireReadableGroup(service: SupabaseService, actor: SopProfileAccess, groupId: string) {
  const group = (await listGroups(service, [groupId]))[0];
  if (!group) throw new Error("小组不存在");
  const access = canReadGroupSop(actor, groupId, group.team_id);
  if (!access.allowed) throw new Error("无权限查看该小组");
  return group;
}

function requireSopManagementView(actor: SopProfileAccess, message = "无权限查看审核中心") {
  const access = canAccessSopManagementView(actor);
  if (!access.allowed) throw new Error(message);
}

async function resolveVisibleMemberFilter(
  service: SupabaseService,
  actor: SopProfileAccess,
  requestedGroupId?: string | null,
) {
  if (requestedGroupId) {
    await requireReadableGroup(service, actor, requestedGroupId);
    return { groupIds: [requestedGroupId], teamId: null as string | null };
  }

  if (actor.role === "owner") {
    return { groupIds: null as string[] | null, teamId: null as string | null };
  }

  if (actor.businessRole === "team_admin" && actor.teamId) {
    return { groupIds: null as string[] | null, teamId: actor.teamId };
  }

  const groupIds = resolveActorGroupIds(actor);
  return { groupIds, teamId: null as string | null };
}

export async function loadMyTodaySopStatus(statusDate = todayIso()) {
  const service = createAdminClient();
  const actor = await requireActor(service);
  const profile = await getProfile(service, actor.userId);
  const status = await ensureDailyStatus(service, profile, statusDate);
  const submissions = await getSubmissions(service, [profile.id], statusDate);

  return toMemberStatus(profile, status, submissions);
}

export async function submitMySopCheckpoint(input: {
  checkpoint: SopCheckpoint;
  statusDate?: string;
  topicText?: string | null;
  scriptText?: string | null;
  videoUrl?: string | null;
  notes?: string | null;
}) {
  validateSubmissionContent(input);

  const statusDate = input.statusDate ?? todayIso();
  const service = createAdminClient();
  const actor = await requireActor(service);
  const access = canSubmitOwnCheckpoint(actor, actor.userId);
  if (!access.allowed) throw new Error("无权限提交该卡点");

  const profile = await getProfile(service, actor.userId);
  const status = await ensureDailyStatus(service, profile, statusDate);
  const payload = {
    user_id: profile.id,
    team_id: profile.team_id,
    group_id: profile.group_id,
    status_date: statusDate,
    checkpoint: input.checkpoint,
    ...normalizeSubmissionPayload(input),
    review_status: "SUBMITTED",
    submitted_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data: submission, error } = await service
    .from("sop_checkpoint_submissions")
    .upsert(payload, { onConflict: "user_id,status_date,checkpoint" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const nextStatus = await transitionDailyCheckpoint(service, status, input.checkpoint, "SUBMITTED");

  return {
    status: toMemberStatus(profile, nextStatus, [submission as SopCheckpointSubmission]),
    submission: submission as SopCheckpointSubmission,
  };
}

export async function loadSopStatuses(input: { statusDate?: string; groupId?: string | null } = {}) {
  const statusDate = input.statusDate ?? todayIso();
  const service = createAdminClient();
  const actor = await requireActor(service);

  if (actor.role === "member") {
    if (input.groupId) throw new Error("无权限查看该小组");
    const profile = await getProfile(service, actor.userId);
    return loadStatusesForProfiles(service, [profile], statusDate);
  }

  const filter = await resolveVisibleMemberFilter(service, actor, input.groupId);
  if (filter.groupIds && filter.groupIds.length === 0) return [];

  const profiles = await listMemberProfiles(service, filter);
  return loadStatusesForProfiles(service, profiles, statusDate);
}

export async function loadGroupSopStatuses(groupId: string, statusDate = todayIso()) {
  const service = createAdminClient();
  const actor = await requireActor(service);
  await requireReadableGroup(service, actor, groupId);

  const profiles = await listMemberProfiles(service, { groupIds: [groupId] });
  return loadStatusesForProfiles(service, profiles, statusDate);
}

export async function loadMyReviewQueue(statusDate = todayIso()) {
  const service = createAdminClient();
  const actor = await requireActor(service);
  requireSopManagementView(actor, "无权限查看审核中心");

  if (actor.role === "owner") return loadSopStatuses({ statusDate });

  const filter = await resolveVisibleMemberFilter(service, actor);
  if (filter.groupIds && filter.groupIds.length === 0) return [];

  const profiles = await listMemberProfiles(service, filter);
  return loadStatusesForProfiles(service, profiles, statusDate);
}

export async function reviewSopCheckpoint(input: {
  submissionId: string;
  scores: SopReviewScores;
  rejectionReason?: string | null;
}) {
  const service = createAdminClient();
  const actor = await requireActor(service);
  const { data: submission, error } = await service
    .from("sop_checkpoint_submissions")
    .select("*")
    .eq("id", input.submissionId)
    .single();

  if (error || !submission) throw new Error("提交记录不存在");

  const target = await getProfile(service, submission.user_id);
  const access = canReviewCheckpoint(actor, {
    userId: target.id,
    teamId: target.team_id,
    groupId: target.group_id,
  });
  if (!access.allowed) throw new Error("无权限审核该成员");

  const decision = buildReviewDecision(input.scores);
  if (!decision.isPassed && !input.rejectionReason?.trim()) {
    throw new Error("打回必须填写原因");
  }

  const status = await ensureDailyStatus(service, target, submission.status_date);
  if (statusMap(status)[submission.checkpoint as SopCheckpoint] !== "SUBMITTED") {
    throw new Error("只有已提交的卡点才能审核");
  }

  const { data: review, error: reviewError } = await service
    .from("sop_review_scores")
    .insert({
      submission_id: input.submissionId,
      reviewer_user_id: actor.userId,
      hook_score: input.scores.HOOK,
      viewpoint_score: input.scores.VIEWPOINT,
      compliance_score: input.scores.COMPLIANCE,
      performance_hook_score: input.scores.PERFORMANCE_HOOK,
      yesterday_review_score: input.scores.YESTERDAY_REVIEW,
      cta_score: input.scores.CTA,
      total_score: decision.totalScore,
      is_passed: decision.isPassed,
      rejection_reason: decision.isPassed ? null : input.rejectionReason?.trim(),
    })
    .select("*")
    .single();

  if (reviewError) throw new Error(reviewError.message);

  const { error: submissionError } = await service
    .from("sop_checkpoint_submissions")
    .update({
      review_status: decision.nextStatus,
      updated_at: nowIso(),
    })
    .eq("id", input.submissionId);

  if (submissionError) throw new Error(submissionError.message);
  await transitionDailyCheckpoint(service, status, submission.checkpoint as SopCheckpoint, decision.nextStatus);

  return {
    review,
    decision,
  };
}

export async function updateSopCheckpointStatus(input: {
  userId: string;
  checkpoint: SopCheckpoint;
  status: SopCheckpointStatus;
  statusDate?: string;
  submissionId?: string | null;
  rejectionReason?: string | null;
  scores?: SopReviewScores | null;
}) {
  const statusDate = input.statusDate ?? todayIso();
  const service = createAdminClient();
  const actor = await requireActor(service);
  const target = await getProfile(service, input.userId);
  const current = await ensureDailyStatus(service, target, statusDate);

  if (input.status === "APPROVED" || input.status === "REJECTED") {
    if (input.status === "REJECTED" && !input.rejectionReason?.trim()) {
      throw new Error("审核打回必须填写原因");
    }

    const submissionQuery = service
      .from("sop_checkpoint_submissions")
      .select("*")
      .eq("user_id", target.id)
      .eq("status_date", statusDate)
      .eq("checkpoint", input.checkpoint);

    const { data: submission, error } = input.submissionId
      ? await submissionQuery.eq("id", input.submissionId).single()
      : await submissionQuery.single();

    if (error || !submission) throw new Error("提交记录不存在");

    const access = canReviewCheckpoint(actor, {
      userId: target.id,
      teamId: target.team_id,
      groupId: target.group_id,
    });
    if (!access.allowed) throw new Error("无权限审核该成员");

    const scores = input.scores ?? scoreFromStatus(input.status);
    const decision = buildReviewDecision(scores);
    const nextStatus = input.status;
    const isPassed = nextStatus === "APPROVED";

    const { error: reviewError } = await service.from("sop_review_scores").insert({
      submission_id: submission.id,
      reviewer_user_id: actor.userId,
      hook_score: scores.HOOK,
      viewpoint_score: scores.VIEWPOINT,
      compliance_score: scores.COMPLIANCE,
      performance_hook_score: scores.PERFORMANCE_HOOK,
      yesterday_review_score: scores.YESTERDAY_REVIEW,
      cta_score: scores.CTA,
      total_score: decision.totalScore,
      is_passed: isPassed,
      rejection_reason: isPassed ? null : input.rejectionReason?.trim(),
    });

    if (reviewError) throw new Error(reviewError.message);

    const { error: submissionError } = await service
      .from("sop_checkpoint_submissions")
      .update({
        review_status: nextStatus,
        updated_at: nowIso(),
      })
      .eq("id", submission.id);

    if (submissionError) throw new Error(submissionError.message);
    const nextDailyStatus = await transitionDailyCheckpoint(service, current, input.checkpoint, nextStatus);
    const submissions = await getSubmissions(service, [target.id], statusDate);

    return toMemberStatus(target, nextDailyStatus, submissions);
  }

  if (input.status === "SUBMITTED") {
    const access = canSubmitOwnCheckpoint(actor, target.id);
    if (!access.allowed) throw new Error("无权限提交该卡点");
  } else {
    const access = canReviewCheckpoint(actor, {
      userId: target.id,
      teamId: target.team_id,
      groupId: target.group_id,
    });
    if (!access.allowed) throw new Error("无权限更新该成员");
  }

  const nextDailyStatus = await transitionDailyCheckpoint(service, current, input.checkpoint, input.status);
  const submissions = await getSubmissions(service, [target.id], statusDate);
  return toMemberStatus(target, nextDailyStatus, submissions);
}

export async function loadSopMatrix(statusDate = todayIso()) {
  const service = createAdminClient();
  const actor = await requireActor(service);
  requireSopManagementView(actor, "无权限查看全员矩阵");

  if (actor.role === "owner") return loadSopStatuses({ statusDate });

  const filter = await resolveVisibleMemberFilter(service, actor);
  if (filter.groupIds && filter.groupIds.length === 0) throw new Error("无权限查看全员矩阵");

  const profiles = await listMemberProfiles(service, filter);
  return loadStatusesForProfiles(service, profiles, statusDate);
}

export async function loadMemberSopStatus(targetUserId: string, statusDate = todayIso()) {
  const service = createAdminClient();
  const actor = await requireActor(service);
  const profile = await getProfile(service, targetUserId);
  const access = canReadSopStatus(actor, {
    userId: profile.id,
    teamId: profile.team_id,
    groupId: profile.group_id,
  });
  if (!access.allowed) throw new Error("无权限查看该成员");

  const status = await ensureDailyStatus(service, profile, statusDate);
  const submissions = await getSubmissions(service, [profile.id], statusDate);
  return toMemberStatus(profile, status, submissions);
}

export async function loadLeaderBoard(input: { statusDate?: string; groupId?: string | null } = {}) {
  const statusDate = input.statusDate ?? todayIso();
  const service = createAdminClient();
  const actor = await requireActor(service);
  requireSopManagementView(actor, "无权限查看审核中心");
  const filter = await resolveVisibleMemberFilter(service, actor, input.groupId);

  if (filter.groupIds && filter.groupIds.length === 0) {
    return {
      statusDate,
      groupId: input.groupId ?? null,
      members: [] as SopMemberStatus[],
      pendingReviews: [] as SopCheckpointSubmission[],
      summary: buildLeaderSummary([], [], []),
    };
  }

  const profiles = await listMemberProfiles(service, filter);
  const members = await loadStatusesForProfiles(service, profiles, statusDate);
  const submissions = members.flatMap((member) => member.submissions);
  const pendingReviews = submissions.filter(
    (submission) =>
      SOP_REVIEW_CHECKPOINTS.includes(submission.checkpoint) &&
      (submission.review_status === "SUBMITTED" || submission.review_status === "PENDING"),
  );
  const reports = await loadDailyMetrics(service, profiles.map((profile) => profile.id), statusDate);

  return {
    statusDate,
    groupId: input.groupId ?? (filter.groupIds?.length === 1 ? filter.groupIds[0] : null),
    members,
    pendingReviews,
    summary: buildLeaderSummary(members, pendingReviews, reports),
  };
}

async function loadDailyMetrics(service: SupabaseService, userIds: string[], statusDate: string) {
  if (userIds.length === 0) return [] as DailyReportMetricRow[];

  const { data, error } = await service
    .from("daily_reports")
    .select("user_id, report_date, play_count, likes")
    .in("user_id", userIds)
    .eq("report_date", statusDate);

  if (error) throw new Error(error.message);
  return (data ?? []) as DailyReportMetricRow[];
}

function buildLeaderSummary(
  members: SopMemberStatus[],
  pendingReviews: SopCheckpointSubmission[],
  reports: DailyReportMetricRow[],
) {
  const reportCount = reports.length;
  const reportedUserCount = new Set(reports.map((report) => report.user_id).filter(Boolean)).size;
  const totalPlayCount = reports.reduce((sum, report) => sum + (report.play_count ?? 0), 0);
  const totalLikes = reports.reduce((sum, report) => sum + (report.likes ?? 0), 0);
  const reviewSubmissions = members.flatMap((member) =>
    member.submissions.filter((submission) => SOP_REVIEW_CHECKPOINTS.includes(submission.checkpoint)),
  );

  return {
    memberCount: members.length,
    dataReportSubmittedCount: members.filter((member) => SUBMITTED_STATUSES.has(member.statuses.DATA_REPORT)).length,
    dataReportRate: members.length > 0 ? Math.round((reportedUserCount / members.length) * 100) / 100 : 0,
    averagePlayCount: reportCount > 0 ? Math.round(totalPlayCount / reportCount) : 0,
    averageLikes: reportCount > 0 ? Math.round(totalLikes / reportCount) : 0,
    pendingReviewCount: pendingReviews.length,
    approvedReviewCount: reviewSubmissions.filter((submission) => submission.review_status === "APPROVED").length,
    rejectedReviewCount: reviewSubmissions.filter((submission) => submission.review_status === "REJECTED").length,
    reviewPassRate:
      reviewSubmissions.length > 0
        ? Math.round(
            (reviewSubmissions.filter((submission) => submission.review_status === "APPROVED").length /
              reviewSubmissions.length) *
              100,
          ) / 100
        : 0,
  };
}

export async function loadLeaderReports(input: { statusDate?: string; groupId?: string | null } = {}) {
  const statusDate = input.statusDate ?? todayIso();
  const service = createAdminClient();
  const actor = await requireActor(service);

  if (actor.role !== "owner") {
    let query = service.from("leader_daily_reports").select("*").eq("leader_user_id", actor.userId).eq("report_date", statusDate);
    if (input.groupId) {
      await requireReadableGroup(service, actor, input.groupId);
      query = query.eq("group_id", input.groupId);
    }

    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    return {
      statusDate,
      reports: (data ?? []) as LeaderDailyReportRow[],
    };
  }

  const groupIds = input.groupId ? [input.groupId] : null;
  const groups = await listGroups(service, groupIds);
  const leaderIds = groups.map((group) => group.leader_user_id).filter((id): id is string => Boolean(id));
  const [reportsResult, leadersResult] = await Promise.all([
    service.from("leader_daily_reports").select("*").eq("report_date", statusDate),
    leaderIds.length > 0
      ? service.from("profiles").select("id, name").in("id", leaderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (reportsResult.error) throw new Error(reportsResult.error.message);
  if (leadersResult.error) throw new Error(leadersResult.error.message);

  const reportByGroupId = new Map(
    ((reportsResult.data ?? []) as LeaderDailyReportRow[]).map((report) => [report.group_id, report]),
  );
  const leaderNameById = new Map(((leadersResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));

  return {
    statusDate,
    reports: groups.map((group) => {
      const report = reportByGroupId.get(group.id) ?? null;
      return {
        groupId: group.id,
        groupName: group.name,
        leaderUserId: group.leader_user_id,
        leaderName: group.leader_user_id ? leaderNameById.get(group.leader_user_id) ?? null : null,
        status: report?.submitted_at ? "SUBMITTED" : report ? "DRAFT" : "MISSING",
        report,
      };
    }),
  };
}

export async function saveLeaderReport(input: {
  statusDate?: string;
  groupId?: string | null;
  topicFeedback?: string | null;
  openingFeedback?: string | null;
  scriptFeedback?: string | null;
  videoFeedback?: string | null;
  isDraft?: boolean;
}) {
  const statusDate = input.statusDate ?? todayIso();
  const service = createAdminClient();
  const actor = await requireActor(service);
  const actorGroupIds = resolveActorGroupIds(actor);
  const groupId = input.groupId ?? actor.groupId ?? actor.ledGroupIds[0] ?? null;

  if (!groupId || !isUuidLike(groupId)) throw new Error("缺少组别");
  await requireReadableGroup(service, actor, groupId);

  if (actor.role !== "owner" && actorGroupIds.length === 0) {
    throw new Error("只有组长可以提交日报");
  }

  const now = nowIso();
  const payload = {
    leader_user_id: actor.userId,
    group_id: groupId,
    report_date: statusDate,
    topic_feedback: input.topicFeedback?.trim() || null,
    opening_feedback: input.openingFeedback?.trim() || null,
    script_feedback: input.scriptFeedback?.trim() || null,
    video_feedback: input.videoFeedback?.trim() || null,
    submitted_at: input.isDraft ? null : now,
    updated_at: now,
  };

  const { data, error } = await service
    .from("leader_daily_reports")
    .upsert(payload, { onConflict: "leader_user_id,report_date" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as LeaderDailyReportRow;
}

export async function loadSopAlerts(input: { statusDate?: string; groupId?: string | null } = {}) {
  const statusDate = input.statusDate ?? todayIso();
  const service = createAdminClient();
  const actor = await requireActor(service);

  if (actor.role === "member") {
    if (input.groupId) throw new Error("无权限查看该小组");
    const profile = await getProfile(service, actor.userId);
    const members = await loadStatusesForProfiles(service, [profile], statusDate);
    const reports = await loadReportsForTrend(service, [profile.id], statusDate);
    return buildSopAlertsForProfiles([profile], members, reports, statusDate);
  }

  const filter = await resolveVisibleMemberFilter(service, actor, input.groupId);

  if (filter.groupIds && filter.groupIds.length === 0) return [] as SopAlert[];

  const profiles = await listMemberProfiles(service, filter);
  const members = await loadStatusesForProfiles(service, profiles, statusDate);
  const reports = await loadReportsForTrend(service, profiles.map((profile) => profile.id), statusDate);
  return buildSopAlertsForProfiles(profiles, members, reports, statusDate);
}

function buildSopAlertsForProfiles(
  profiles: ProfileRow[],
  members: SopMemberStatus[],
  reports: DailyReportMetricRow[],
  statusDate: string,
) {
  const alerts: SopAlert[] = [];

  for (const member of members) {
    for (const checkpoint of Object.keys(DEFAULT_STATUSES) as SopCheckpoint[]) {
      const checkpointStatus = member.statuses[checkpoint];
      if (isPendingForOverdue(checkpointStatus) && hasDeadlinePassed(statusDate, checkpoint)) {
        alerts.push({
          id: `overdue:${member.userId}:${statusDate}:${checkpoint}`,
          type: "OVERDUE_CHECKPOINT",
          severity: checkpointStatus === "OVERDUE" ? "critical" : "warning",
          userId: member.userId,
          userName: member.userName,
          groupId: member.groupId,
          statusDate,
          checkpoint,
          checkpointLabel: SOP_CHECKPOINT_LABELS[checkpoint],
          message: `${member.userName} ${SOP_CHECKPOINT_LABELS[checkpoint]}超时未交`,
          detail: { deadline: SOP_CHECKPOINT_DEADLINES[checkpoint], status: checkpointStatus },
        });
      }
    }

    if (!SUBMITTED_STATUSES.has(member.statuses.DATA_REPORT) && !isDateExempt(profiles.find((profile) => profile.id === member.userId)!, statusDate)) {
      alerts.push({
        id: `missing:${member.userId}:${statusDate}`,
        type: "MISSING_DAILY_REPORT",
        severity: "critical",
        userId: member.userId,
        userName: member.userName,
        groupId: member.groupId,
        statusDate,
        checkpoint: "DATA_REPORT",
        checkpointLabel: SOP_CHECKPOINT_LABELS.DATA_REPORT,
        message: `${member.userName} 今日数据断更`,
      });
    }
  }

  alerts.push(...buildDeclineAlerts(profiles, reports, statusDate));
  return alerts;
}

async function loadReportsForTrend(service: SupabaseService, userIds: string[], statusDate: string) {
  if (userIds.length === 0) return [] as DailyReportMetricRow[];
  const since = shiftDateString(statusDate, -6);

  const { data, error } = await service
    .from("daily_reports")
    .select("user_id, report_date, play_count, likes")
    .in("user_id", userIds)
    .gte("report_date", since)
    .lte("report_date", statusDate)
    .order("report_date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DailyReportMetricRow[];
}

function buildDeclineAlerts(profiles: ProfileRow[], reports: DailyReportMetricRow[], statusDate: string) {
  const alerts: SopAlert[] = [];
  const reportsByUserId = new Map<string, Map<string, number>>();

  for (const report of reports) {
    if (!report.user_id) continue;
    const current = reportsByUserId.get(report.user_id) ?? new Map<string, number>();
    current.set(report.report_date, (current.get(report.report_date) ?? 0) + (report.play_count ?? 0));
    reportsByUserId.set(report.user_id, current);
  }

  for (const profile of profiles) {
    const byDate = reportsByUserId.get(profile.id);
    if (!byDate) continue;

    const dates = Array.from({ length: 6 }, (_, index) => shiftDateString(statusDate, index - 5));
    const values = dates.map((date) => byDate.get(date) ?? null);
    if (values.some((value) => value == null)) continue;

    const previous = values.slice(0, 3) as number[];
    const recent = values.slice(3) as number[];
    const previousAvg = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const strictlyDeclining = recent[0] > recent[1] && recent[1] > recent[2];

    if (previousAvg > 0 && recentAvg < previousAvg && strictlyDeclining) {
      alerts.push({
        id: `decline:${profile.id}:${statusDate}`,
        type: "DECLINING_PLAY_COUNT",
        severity: "warning",
        userId: profile.id,
        userName: profile.name,
        groupId: profile.group_id,
        statusDate,
        message: `${profile.name} 播放量连续下滑`,
        detail: {
          previousAvg: Math.round(previousAvg),
          recentAvg: Math.round(recentAvg),
          recent,
        },
      });
    }
  }

  return alerts;
}

export async function checkAndMarkOverdue(statusDate = todayIso()) {
  const service = createAdminClient();
  const profiles = await listMemberProfiles(service);
  const statuses = await Promise.all(profiles.map((profile) => ensureDailyStatus(service, profile, statusDate)));
  const updates: Array<{ userId: string; checkpoint: SopCheckpoint; status: SopCheckpointStatus }> = [];

  for (const status of statuses) {
    let current = status;

    for (const checkpoint of Object.keys(DEFAULT_STATUSES) as SopCheckpoint[]) {
      const checkpointStatus = statusMap(current)[checkpoint];
      if ((checkpointStatus === "IDLE" || checkpointStatus === "PENDING") && hasDeadlinePassed(statusDate, checkpoint)) {
        current = await updateDailyCheckpoint(service, current, checkpoint, "OVERDUE", { system: true });
        updates.push({ userId: status.user_id, checkpoint, status: "OVERDUE" });
      }
    }
  }

  return {
    statusDate,
    updatedCount: updates.length,
    updates,
  };
}
