export type FeishuAuthBridge = {
  requestAuthCode: (options: {
    appId: string;
    success: (result: { code: string }) => void;
    fail: (error: unknown) => void;
  }) => void;
};

function normalizeFeishuErrorCode(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : undefined;
}

export function getSafeFeishuErrorCode(error: unknown): string | number | undefined {
  const directCode = normalizeFeishuErrorCode(error);
  if (directCode !== undefined) return directCode;
  if (!error || typeof error !== "object") return undefined;

  for (const key of ["code", "errorCode", "errno"] as const) {
    const code = normalizeFeishuErrorCode((error as Record<string, unknown>)[key]);
    if (code !== undefined) return code;
  }

  return undefined;
}

export function requestFeishuAuthCode(
  bridge: FeishuAuthBridge,
  appId: string,
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    bridge.requestAuthCode({
      appId,
      success: resolve,
      fail: reject,
    });
  });
}
