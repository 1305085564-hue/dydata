import { NextResponse } from "next/server";
import { UUID_PATTERN, requireAdminServiceClient, requireActiveVisibleUsers, requireOwnerOrAdminRole, readJsonBody } from "../../_shared";
import { emit } from "@/lib/notifications/server";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import { isActiveMembership } from "@/lib/member-lifecycle";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type LayerStatus = "succeeded" | "failed" | "skipped";
type MutationLayers = {
  businessSucceeded: boolean;
  auditStatus: LayerStatus;
  employeeNotificationStatus: LayerStatus;
  todoStatus: LayerStatus;
};

async function handlePost(request: Request, observation: MutationObservation, layers: MutationLayers) {
  observation.mark("validate");
  const body = await readJsonBody(request);
  if ("response" in body) return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  const appealId = typeof body.data?.appealId === "string" ? body.data.appealId.trim() : "";
  if (!UUID_PATTERN.test(appealId)) return NextResponse.json({ error: "appealId 必须是 uuid" }, { status: 400 });

  observation.mark("auth");
  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;

  observation.mark("read");
  const appealResult = await auth.supabase
    .from("fulfillment_appeals")
    .select("id, user_id, account_id, record_date, reason, status")
    .eq("id", appealId)
    .maybeSingle();
  if (appealResult.error) return NextResponse.json({ error: "读取补交申诉失败" }, { status: 500 });
  if (!appealResult.data) return NextResponse.json({ error: "补交申诉不存在" }, { status: 404 });
  observation.mark("scope");
  const scoped = requireActiveVisibleUsers(auth, [appealResult.data.user_id]);
  if (scoped) return scoped;
  if (appealResult.data.status !== "approved" && appealResult.data.status !== "rejected") {
    return NextResponse.json({ error: "仅支持打回已处理的补交申诉" }, { status: 409 });
  }

  observation.mark("review-rpc");
  const rpc = await auth.supabase.rpc("reopen_fulfillment_appeal_atomically", {
    p_appeal_id: appealId,
    p_handler_id: auth.actor.userId,
  });
  if (rpc.error) return NextResponse.json({ error: rpc.error.message || "打回补交申诉失败" }, { status: 409 });
  layers.businessSucceeded = true;
  layers.auditStatus = "succeeded";

  // 作废旧的通过/驳回结果通知；新的审批结果会由后续处理动作重新发送。
  observation.mark("write-request");
  await auth.supabase
    .from("notifications")
    .update({ status: "done", done_at: new Date().toISOString(), expires_at: new Date().toISOString() })
    .eq("source_type", "fulfillment_appeal_result")
    .eq("source_id", appealId);

  const requester = await auth.supabase.from("profiles").select("name, team_id").eq("id", appealResult.data.user_id).maybeSingle();
  const candidates = await auth.supabase
    .from("profiles")
    .select("id, role, company_role, permissions, team_id, membership_status")
    .in("role", ["owner", "admin"]);
  const recipients = (candidates.data ?? [])
    .filter((profile) => {
      if (!isActiveMembership(profile) || profile.team_id !== requester.data?.team_id) return false;
      const role = resolveProfileCompanyRole(profile.role, profile.company_role);
      return !role.conflict && (role.companyRole === "company_owner" || (role.companyRole === "admin" && profile.permissions?.manage_members === true));
    })
    .map((profile) => profile.id);
  const notification = await emit({
    recipients,
    type: "fulfillment.appeal",
    category: "todo",
    severity: "warning",
    title: `${requester.data?.name || "成员"}的补交申诉已打回待审批`,
    body: `${appealResult.data.record_date}\n${appealResult.data.reason}`,
    actionLabel: "处理补交申请",
    actionUrl: "/admin/fulfillment",
    sourceType: "fulfillment_appeal",
    sourceId: appealId,
    payload: { appealId, accountId: appealResult.data.account_id, recordDate: appealResult.data.record_date, userId: appealResult.data.user_id, reopened: true },
  });
  layers.todoStatus = notification.ok ? "succeeded" : "failed";
  if (!notification.ok) observation.mark("compensate");
  observation.mark("finalize");

  return NextResponse.json({
    ok: true,
    appealId,
    status: "pending",
    oldResultNotificationsVoided: true,
    todoReissued: notification.ok,
  });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/admin/fulfillment/appeal/reopen", request, async (observation) => {
    const layers: MutationLayers = {
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
    };
    observation.setDetail?.(layers);
    const response = await handlePost(request, observation, layers);
    observation.setDetail?.(layers);
    return appendObservedMutationResult(response, observation);
  });
}
