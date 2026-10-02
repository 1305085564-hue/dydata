import type { CompanyRole } from "@/types";

export interface PermanentExemptionTarget {
  id: string;
  name?: string | null;
  status?: string | null;
  exempt_type?: string | null;
  exempt_reason?: string | null;
  exempt_end_date?: string | null;
}

/**
 * 仅 company_owner 拥有设置与撤销不参与考核的权限
 */
export function canManagePermanentExemption(companyRole: CompanyRole | null | undefined): boolean {
  return companyRole === "company_owner";
}

export interface PermanentExemptionState {
  isPermanent: boolean;
  isTemporary: boolean;
  statusText: string;
  badgeLabel: string | null;
  description: string;
}

/**
 * 解析成员的不参与考核展示状态
 * 严格区分 permanent 与 temporary，严禁把临时豁免误显示为不参与考核
 */
export function resolvePermanentExemptionState(
  target: Pick<PermanentExemptionTarget, "exempt_type" | "exempt_reason" | "exempt_end_date"> | null | undefined,
): PermanentExemptionState {
  if (!target) {
    return {
      isPermanent: false,
      isTemporary: false,
      statusText: "正常参与考核",
      badgeLabel: null,
      description: "开启后不再进入应交与缺交考核统计",
    };
  }

  if (target.exempt_type === "permanent") {
    return {
      isPermanent: true,
      isTemporary: false,
      statusText: "已设置不参与考核",
      badgeLabel: "已设置不参与考核",
      description: target.exempt_reason ? `原因：${target.exempt_reason}` : "已由公司所有者设为永久不参与考核",
    };
  }

  if (target.exempt_type === "temporary") {
    return {
      isPermanent: false,
      isTemporary: true,
      statusText: "临时豁免中",
      badgeLabel: null,
      description: target.exempt_end_date
        ? `临时豁免至 ${target.exempt_end_date}，设为永久将优先`
        : "当前处于临时豁免期，设为永久将优先",
    };
  }

  return {
    isPermanent: false,
    isTemporary: false,
    statusText: "正常参与考核",
    badgeLabel: null,
    description: "开启后不再进入应交与缺交考核统计",
  };
}

/**
 * 校验不参与考核原因
 */
export function validatePermanentExemptionReason(
  reason: unknown,
): { ok: true; data: string } | { ok: false; error: string } {
  if (typeof reason !== "string") {
    return { ok: false, error: "请填写设置不参与考核的原因" };
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, error: "设置不参与考核必须填写原因" };
  }
  if (trimmed.length > 500) {
    return { ok: false, error: "原因说明不能超过 500 个字" };
  }
  return { ok: true, data: trimmed };
}

/**
 * 调用后端接口设置永久不参与考核
 */
export async function requestSetPermanentExemption({
  userId,
  reason,
  fetcher = fetch,
}: {
  userId: string;
  reason: string;
  fetcher?: typeof fetch;
}): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const validation = validatePermanentExemptionReason(reason);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  try {
    const response = await fetcher("/api/exemptions/permanent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, reason: validation.data }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg =
        typeof body?.error === "string" && body.error.trim()
          ? body.error.trim()
          : "设置不参与考核失败，请重试";
      return { ok: false, error: errorMsg };
    }

    return { ok: true, data: body?.data ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "网络异常，请重试";
    return { ok: false, error: message };
  }
}

/**
 * 调用后端接口撤销永久不参与考核
 */
export async function requestClearPermanentExemption({
  userId,
  fetcher = fetch,
}: {
  userId: string;
  fetcher?: typeof fetch;
}): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetcher("/api/exemptions/permanent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg =
        typeof body?.error === "string" && body.error.trim()
          ? body.error.trim()
          : "撤销不参与考核失败，请重试";
      return { ok: false, error: errorMsg };
    }

    return { ok: true, data: body?.data ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "网络异常，请重试";
    return { ok: false, error: message };
  }
}
