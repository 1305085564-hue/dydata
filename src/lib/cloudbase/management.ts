type UserReadback = { user: unknown | null; error?: unknown | null };
type StatusWriteback = { data: unknown; error: unknown | null };

export function mapSupabaseBanDuration(value: unknown): 1 | 3 | null {
  if (value === "none") return 1;
  if (value === "876000h") return 3;
  return null;
}

function managementError(message: string, code: string, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

// The caller is the existing server-only admin adapter. Business authorization
// remains in member-lifecycle-service; this writer grants no new browser power.
export function createCloudBaseUserManagement(dependencies: {
  writeUserStatus: (subject: string, status: 1 | 3) => Promise<StatusWriteback>;
  getUserById: (subject: string) => Promise<UserReadback>;
  readBackAttempts?: number;
  readBackIntervalMs?: number;
  readBackTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  async function updateUserById(userId: string, attributes: unknown) {
    if (!userId || userId.length > 64 || userId.trim() !== userId) {
      return { data: { user: null }, error: managementError("CloudBase 用户 ID 无效", "invalid_user_id") };
    }
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
      return { data: { user: null }, error: managementError("CloudBase 仅支持用户冻结或解冻", "unsupported_operation") };
    }
    const keys = Object.keys(attributes);
    if (keys.length !== 1 || keys[0] !== "ban_duration") {
      return { data: { user: null }, error: managementError("CloudBase 暂不支持修改密码、邮箱或员工 Auth 资料", "unsupported_operation") };
    }
    const userStatus = mapSupabaseBanDuration((attributes as { ban_duration?: unknown }).ban_duration);
    if (userStatus === null) {
      return { data: { user: null }, error: managementError("封禁时长格式不受支持", "invalid_ban_duration") };
    }
    let written: StatusWriteback;
    try {
      written = await dependencies.writeUserStatus(userId, userStatus);
    } catch {
      return { data: { user: null }, error: managementError("CloudBase 用户状态修改失败", "management_failed", 502) };
    }
    const state = written.data;
    if (written.error || !state || typeof state !== "object" || Array.isArray(state)
      || (state as { subject?: unknown }).subject !== userId
      || (state as { status?: unknown }).status !== userStatus) {
      return { data: { user: null }, error: managementError("CloudBase 未确认目标用户状态修改成功", "management_rejected", 502) };
    }

    const attempts = Math.max(1, Math.min(10, Math.floor(dependencies.readBackAttempts ?? 10)));
    const intervalMs = Math.max(0, Math.min(1_000, dependencies.readBackIntervalMs ?? 1_000));
    const timeoutMs = Math.max(1, Math.min(10_000, dependencies.readBackTimeoutMs ?? 10_000));
    const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const deadline = Date.now() + timeoutMs;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      let readback: UserReadback;
      try {
        const readbackResult = await new Promise<UserReadback | null>((resolve, reject) => {
          const timer = setTimeout(() => resolve(null), remaining);
          Promise.resolve().then(() => dependencies.getUserById(userId)).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error: unknown) => { clearTimeout(timer); reject(error); },
          );
        });
        if (!readbackResult) break;
        readback = readbackResult;
      } catch {
        readback = { user: null, error: "readback_failed" };
      }

      if (!readback.error && readback.user && typeof readback.user === "object" && !Array.isArray(readback.user)) {
        const user = readback.user as Record<string, unknown>;
        if (user.id !== userId) {
          return { data: { user: null }, error: managementError("状态修改后的 Auth 用户 ID 与目标不符", "readback_subject_mismatch", 502) };
        }
        const hasBanState = Object.prototype.hasOwnProperty.call(user, "banned_until");
        const matchesStatus = hasBanState && (userStatus === 3
          ? user.banned_until !== null && user.banned_until !== undefined
          : user.banned_until === null);
        if (matchesStatus) return { data: { user: readback.user }, error: null };
      }

      if (attempt < attempts) {
        const sleepFor = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
        if (sleepFor > 0) await sleep(sleepFor);
      }
    }
    return {
      data: { user: null },
      error: managementError("CloudBase 状态写入后未通过独立读回确认；请稍后核实", "status_pending", 503),
    };
  }

  return { updateUserById };
}
