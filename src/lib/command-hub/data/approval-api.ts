import type { ExemptionRequest } from "@/lib/exemption-approvals";
import type { ReviewAction } from "@/lib/command-hub/types";

export async function fetchPendingApprovals(): Promise<ExemptionRequest[]> {
  const res = await fetch("/api/exemptions/pending", { cache: "no-store" });
  if (!res.ok) throw new Error("pending approvals fetch failed");
  const json = await res.json();
  return json.data ?? [];
}

export async function fetchHistoryApprovals(): Promise<ExemptionRequest[]> {
  const res = await fetch("/api/exemptions/history?limit=50", { cache: "no-store" });
  if (!res.ok) throw new Error("history approvals fetch failed");
  const json = await res.json();
  return json.data ?? [];
}

export interface ReviewRequestResult {
  requestId: string;
  ok: boolean;
  status: number;
  message: string;
}

export async function reviewExemptionRequest(
  requestId: string,
  action: ReviewAction,
  feedback: string | undefined,
  dates: string[] | undefined,
): Promise<ReviewRequestResult> {
  try {
    const res = await fetch("/api/exemptions/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        action,
        feedback: feedback ?? null,
        dates,
      }),
    });
    if (res.ok) return { requestId, ok: true, status: res.status, message: "" };
    let message = "";
    try {
      const json = (await res.json()) as { error?: unknown };
      message = typeof json?.error === "string" ? json.error : "";
    } catch {
      message = "";
    }
    return { requestId, ok: false, status: res.status, message };
  } catch {
    return { requestId, ok: false, status: 0, message: "" };
  }
}

export async function reviewFulfillmentAppeal(
  appealId: string,
  action: ReviewAction,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const decision = action === "approved" ? "approve" : "reject";
  const res = await fetch("/api/admin/fulfillment/appeal/handle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appealId,
      decision,
      reason: reason || undefined,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    businessSucceeded?: boolean;
    error?: string;
  };

  return {
    ok: res.ok && payload.businessSucceeded !== false,
    error: payload.error,
  };
}

export async function reopenExemptionRequest(
  requestId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/exemptions/reopen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: requestId }),
  });
  if (res.ok) return { ok: true };
  const json = await res.json();
  return { ok: false, error: json.error };
}

export async function reopenFulfillmentAppeal(
  appealId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/fulfillment/appeal/reopen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appealId }),
  });
  if (res.ok) return { ok: true };
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: json.error };
}

export async function markNotificationDone(todoId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/notifications/${todoId}/done`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "done" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function markNotificationRead(todoId: string): void {
  void fetch(`/api/notifications/${todoId}/read`, { method: "PATCH" }).catch(() => {});
}
