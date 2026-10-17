import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import type { MutationObservation } from "@/lib/observed-mutation";

type RouteContext = { params: Promise<{ externalVideoId: string }> };

export const dynamic = "force-dynamic";

async function handlePost(request: Request, context: RouteContext, observation?: MutationObservation) {
  observation?.mark("auth");
  const core = await resolvePermissionCore();
  if (!core) return appendObservedMutationResult(NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401 }), observation);
  const { externalVideoId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return appendObservedMutationResult(NextResponse.json({ error: { code: "INVALID_REQUEST", message: "请求体格式不正确" } }, { status: 400 }), observation); }
  const videoId = typeof body === "object" && body !== null && "videoId" in body && typeof body.videoId === "string" ? body.videoId : "";
  if (!videoId) return appendObservedMutationResult(NextResponse.json({ error: { code: "INVALID_VIDEO", message: "缺少目标作品" } }, { status: 400 }), observation);
  const admin = createAdminClient();
  const external = await admin.from("douyin_external_videos").select("id, binding_id, platform_video_id").eq("id", externalVideoId).maybeSingle();
  if (external.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "EXTERNAL_VIDEO_LOAD_FAILED", message: "加载待关联作品失败" } }, { status: 500 }), observation);
  if (!external.data) return appendObservedMutationResult(NextResponse.json({ error: { code: "EXTERNAL_VIDEO_NOT_FOUND", message: "待关联作品不存在" } }, { status: 404 }), observation);
  const binding = await admin.from("douyin_account_bindings").select("account_id").eq("id", external.data.binding_id).maybeSingle();
  if (binding.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "BINDING_LOAD_FAILED", message: "加载抖音绑定失败" } }, { status: 500 }), observation);
  const account = binding.data ? await admin.from("accounts").select("profile_id").eq("id", binding.data.account_id).maybeSingle() : { data: null, error: null };
  if (account.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "ACCOUNT_LOAD_FAILED", message: "加载业务账号失败" } }, { status: 500 }), observation);
  if (!account.data || !core.scope.visibleUserIds.includes(account.data.profile_id)) return appendObservedMutationResult(NextResponse.json({ error: { code: "FORBIDDEN", message: "无权处理该作品" } }, { status: 403 }), observation);
  const video = await admin.from("videos").select("id, account_id, douyin_item_id").eq("id", videoId).eq("account_id", binding.data?.account_id ?? "").eq("lifecycle_state", "active").maybeSingle();
  if (video.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "VIDEO_LOAD_FAILED", message: "加载目标作品失败" } }, { status: 500 }), observation);
  if (!video.data) return appendObservedMutationResult(NextResponse.json({ error: { code: "VIDEO_NOT_ACCESSIBLE", message: "目标作品不存在或不属于该业务账号" } }, { status: 404 }), observation);
  if (video.data.douyin_item_id && video.data.douyin_item_id !== external.data.platform_video_id) return appendObservedMutationResult(NextResponse.json({ error: { code: "VIDEO_ALREADY_BOUND", message: "目标作品已绑定其他抖音作品" } }, { status: 409 }), observation);
  observation?.mark("write-request");
  const updateVideo = await admin.from("videos").update({ douyin_item_id: external.data.platform_video_id }).eq("id", videoId).is("douyin_item_id", null);
  if (updateVideo.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "VIDEO_BIND_FAILED", message: "绑定作品失败" } }, { status: 409 }), observation);
  const updateExternal = await admin.from("douyin_external_videos").update({ matched_video_id: videoId, reconciliation_status: "matched" }).eq("id", externalVideoId);
  if (updateExternal.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "EXTERNAL_VIDEO_BIND_FAILED", message: "保存关联关系失败" } }, { status: 500 }), observation);
  return appendObservedMutationResult(NextResponse.json({ data: { externalVideoId, videoId, status: "matched" } }, { status: 201 }), observation);
}

export async function POST(request: Request, context: RouteContext) {
  return observeMutationRequest("/api/douyin/unmatched/[externalVideoId]/link", request, async (observation) => handlePost(request, context, observation));
}
