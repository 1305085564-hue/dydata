import type { FulfillmentAppeal } from "@/types/fulfillment";

type FulfillmentRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchFulfillmentAppeals(
  request: FulfillmentRequest = fetch,
): Promise<FulfillmentAppeal[]> {
  const response = await request("/api/admin/fulfillment/appeals?limit=150");
  const payload = (await response.json()) as {
    appeals?: FulfillmentAppeal[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "申诉加载失败");
  }
  return Array.isArray(payload.appeals) ? payload.appeals : [];
}

export async function fetchFulfillmentSettings(
  request: FulfillmentRequest = fetch,
): Promise<boolean | null> {
  const response = await request("/api/admin/system/settings");
  if (response.status === 403) {
    // 非系统管理员（如组长），无权限读写系统配置，返回 null 供前端优雅降级展示
    return null;
  }
  const payload = (await response.json()) as {
    feishuFulfillmentReminderEnabled?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "设置读取失败");
  }
  if (typeof payload.feishuFulfillmentReminderEnabled !== "boolean") {
    throw new Error("设置数据格式无效");
  }
  return payload.feishuFulfillmentReminderEnabled;
}

export async function loadFulfillmentSettings(
  canManageSystem: boolean,
  request: FulfillmentRequest = fetch,
): Promise<boolean | null> {
  if (!canManageSystem) {
    return null;
  }
  return fetchFulfillmentSettings(request);
}
