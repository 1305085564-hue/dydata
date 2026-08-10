import { NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import { getActiveVisibleUserIds } from "@/lib/data-access-scope";
import {
  getCurrentMetricRow,
  getReferenceMetrics,
  type RefKey,
} from "@/lib/content-comparison-reference";
import {
  computeAttribution,
  type MultiRefAttributionResult,
  type RefAttributionBlock,
  type SampleStatus,
} from "@/lib/content-attribution";

const VALID_REFS: RefKey[] = ["self", "team", "top", "user"];

const TIME_WINDOWS: Record<RefKey, string> = {
  self: "历史近3条",
  team: "今日团队",
  top: "今日团队最高",
  user: "指定成员近3条",
};

type AttributionRouteContext = { params: Promise<{ videoId: string }> };

type AttributionRouteDependencies = {
  requireScopedAdminVideo: typeof requireScopedAdminVideo;
  getCurrentMetricRow: typeof getCurrentMetricRow;
  getReferenceMetrics: typeof getReferenceMetrics;
};

const DEFAULT_DEPENDENCIES: AttributionRouteDependencies = {
  requireScopedAdminVideo,
  getCurrentMetricRow,
  getReferenceMetrics,
};

type ParsedRequest =
  | { ok: true; requestedRefs: RefKey[]; refUserId: string | null }
  | { ok: false; error: string };

function parseAttributionRequest(searchParams: URLSearchParams): ParsedRequest {
  const hasRefs = searchParams.has("refs");
  const hasRef = searchParams.has("ref");
  if (hasRefs && hasRef) {
    return { ok: false, error: "refs 与 ref 不能同时传入" };
  }

  let requestedRefs: RefKey[];
  if (hasRefs) {
    const rawRefs = (searchParams.get("refs") ?? "").split(",").map((value) => value.trim());
    if (rawRefs.length === 0 || rawRefs.some((value) => !VALID_REFS.includes(value as RefKey))) {
      return { ok: false, error: "refs 包含不支持的参照系" };
    }
    if (new Set(rawRefs).size !== rawRefs.length) {
      return { ok: false, error: "refs 不能重复指定参照系" };
    }
    requestedRefs = rawRefs as RefKey[];
  } else if (hasRef) {
    const ref = (searchParams.get("ref") ?? "").trim();
    if (!VALID_REFS.includes(ref as RefKey)) {
      return { ok: false, error: "ref 包含不支持的参照系" };
    }
    requestedRefs = [ref as RefKey];
  } else {
    // Preserve the old unparameterized API contract.
    requestedRefs = ["self"];
  }

  const refUserId = searchParams.get("refUserId")?.trim() || null;
  if (requestedRefs.includes("user") && !refUserId) {
    return { ok: false, error: "ref=user 时必须提供 refUserId" };
  }
  if (!requestedRefs.includes("user") && refUserId) {
    return { ok: false, error: "refUserId 仅能与 ref=user 一起使用" };
  }

  return { ok: true, requestedRefs, refUserId };
}

function getRequiredSampleCount(ref: RefKey) {
  // top 是一条具体的当日最高视频；其他参照均为聚合值，必须至少三条。
  return ref === "top" ? 1 : 3;
}

export async function buildContentAttributionResponse(
  request: Request,
  context: AttributionRouteContext,
  dependencies: AttributionRouteDependencies = DEFAULT_DEPENDENCIES,
) {
  const parsed = parseAttributionRequest(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { requestedRefs, refUserId } = parsed;
  const { videoId } = await context.params;
  const access = await dependencies.requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const activeVisibleUserIds = getActiveVisibleUserIds(access.scope);
  if (requestedRefs.includes("user")) {
    if (!refUserId || !activeVisibleUserIds.includes(refUserId)) {
      return NextResponse.json({ error: "无权限对比该指定成员" }, { status: 403 });
    }
  }

  const supabase = access.supabase;
  const { video } = access;

  const [currentRow, refMetricResults] = await Promise.all([
    dependencies.getCurrentMetricRow(supabase, videoId),
    Promise.all(requestedRefs.map((refKey) =>
      dependencies.getReferenceMetrics({
        supabase,
        videoId,
        video,
        ref: refKey,
        refUserId,
        activeUserIds: activeVisibleUserIds,
      }).then((result) => ({ refKey, ...result })),
    )),
  ]);

  const attributions: Record<string, RefAttributionBlock> = {};

  for (const item of refMetricResults) {
    const { refKey, reference, refLabel, refCount } = item;
    const attributionRes = computeAttribution(videoId, currentRow, reference, refKey, refLabel);

    const sampleRequired = getRequiredSampleCount(refKey);
    let sampleStatus: SampleStatus = "ready";
    if (!reference) {
      sampleStatus = "missing_snapshot";
    } else if (refCount < sampleRequired) {
      sampleStatus = "insufficient_sample";
    }

    attributions[refKey] = {
      ref: refKey,
      ref_label: refLabel,
      sample_status: sampleStatus,
      sample_count: refCount,
      sample_required: sampleRequired,
      time_window: TIME_WINDOWS[refKey] ?? "基准参考",
      reference_row: reference,
      findings: attributionRes.findings,
      missing: attributionRes.missing,
    };
  }

  const primaryRefKey = requestedRefs[0] ?? "self";
  const primaryBlock = attributions[primaryRefKey];

  const payload: MultiRefAttributionResult = {
    video_id: videoId,
    snapshot_ready: Boolean(currentRow),
    active_refs: requestedRefs,
    current_row: currentRow,
    attributions,
    primary_ref: primaryRefKey,
    // 向后兼容单参照读取者，等价于 primary_ref 对应区块。
    ref: primaryRefKey,
    ref_label: primaryBlock?.ref_label ?? "对比参照",
    findings: primaryBlock?.findings ?? [],
    missing: primaryBlock?.missing ?? [],
  };

  return NextResponse.json(payload);
}

export async function GET(request: Request, context: AttributionRouteContext) {
  return buildContentAttributionResponse(request, context);
}
