import {
  CloudBaseAuthError,
  type CloudBaseAuthToken,
  type CloudBaseSession,
  cloudBaseAuthRequest,
  makeCloudBaseSession,
  mapCloudBaseUser,
} from "./core";

export type CloudBaseUser = ReturnType<typeof mapCloudBaseUser>;
export type VerifiedCloudBaseSession = { session: CloudBaseSession; user: CloudBaseUser };
const REFRESH_BEFORE_EXPIRY_MS = 30_000;
const INACTIVE_ACCOUNT_ERRORS = {
  archived: ["account_archived", "账号已归档，请联系 owner 恢复"],
  blocked: ["account_blocked", "账号已停用，请联系管理员"],
  pending: ["account_pending", "账号尚未激活，请联系管理员"],
  missing: ["account_missing", "账号资料不存在，请联系管理员"],
} as const;

export function isCloudBaseInactiveAccountError(error: unknown): error is CloudBaseAuthError {
  return error instanceof CloudBaseAuthError && Object.values(INACTIVE_ACCOUNT_ERRORS).some(([code]) => error.code === code);
}

async function requireActiveCloudBaseAccount(accessToken: string, fetcher: typeof fetch) {
  let status: unknown;
  try {
    status = await cloudBaseAuthRequest("/v1/rdb/rest/rpc/cloudbase_session_status", {
      method: "POST", token: accessToken, body: {}, fetcher,
    });
  } catch {
    // A failed status lookup is not evidence of an inactive account.
    throw new CloudBaseAuthError(503, "cloudbase_session_status_unavailable");
  }
  if (status === "active") return;
  if (typeof status === "string" && Object.hasOwn(INACTIVE_ACCOUNT_ERRORS, status)) {
    const [code, message] = INACTIVE_ACCOUNT_ERRORS[status as keyof typeof INACTIVE_ACCOUNT_ERRORS];
    throw new CloudBaseAuthError(401, code, message);
  }
  throw new CloudBaseAuthError(503, "cloudbase_session_status_invalid");
}

async function verifyCloudBaseProfile(profile: Record<string, unknown>, accessToken: string, fetcher: typeof fetch, expectedSubject?: string) {
  const user = mapCloudBaseUser(profile);
  if (expectedSubject !== undefined && user.id !== expectedSubject) throw new CloudBaseAuthError(401, "subject_mismatch");
  await requireActiveCloudBaseAccount(accessToken, fetcher);
  return user;
}

async function readCloudBaseProfile(accessToken: string, fetcher: typeof fetch) {
  try {
    return await cloudBaseAuthRequest<Record<string, unknown>>("/auth/v1/user/me", { token: accessToken, fetcher });
  } catch (error) {
    if (error instanceof CloudBaseAuthError && error.code === "user_blocked") {
      // The platform also reports a blocked Auth identity after business archive.
      // This lookup only classifies the rejection; it can never authenticate it.
      try { await requireActiveCloudBaseAccount(accessToken, fetcher); }
      catch (statusError) {
        if (statusError instanceof CloudBaseAuthError && statusError.code === "account_archived") throw statusError;
      }
    }
    throw error;
  }
}

export async function verifyCloudBaseAccessToken(accessToken: string, fetcher: typeof fetch = fetch, expectedSubject?: string) {
  const profile = await readCloudBaseProfile(accessToken, fetcher);
  return verifyCloudBaseProfile(profile, accessToken, fetcher, expectedSubject);
}

function unwrapToken(payload: unknown): CloudBaseAuthToken {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const candidate = root.token && typeof root.token === "object" ? root.token as Record<string, unknown> : root;
  return candidate as unknown as CloudBaseAuthToken;
}

export async function signInCloudBase(
  username: string,
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedCloudBaseSession> {
  const deviceId = globalThis.crypto.randomUUID();
  const tokenResponse = await cloudBaseAuthRequest("/auth/v1/signin", {
    method: "POST",
    body: { username, password },
    deviceId,
    fetcher,
  });
  const session = makeCloudBaseSession(unwrapToken(tokenResponse));
  session.deviceId = deviceId;
  const user = await verifyCloudBaseAccessToken(session.accessToken, fetcher, session.subject);
  return { session, user };
}

export async function refreshCloudBaseSession(
  previous: CloudBaseSession,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedCloudBaseSession> {
  let tokenResponse: unknown;
  try {
    tokenResponse = await cloudBaseAuthRequest("/auth/v1/token", {
      method: "POST",
      body: { grant_type: "refresh_token", refresh_token: previous.refreshToken },
      deviceId: previous.deviceId,
      fetcher,
    });
  } catch (error) {
    if (error instanceof CloudBaseAuthError && error.status >= 400 && error.status < 500) {
      throw new CloudBaseAuthError(401, "invalid_refresh_token");
    }
    throw error;
  }
  const session = makeCloudBaseSession(unwrapToken(tokenResponse));
  if (previous.deviceId) session.deviceId = previous.deviceId;
  if (session.subject !== previous.subject) throw new CloudBaseAuthError(401, "subject_mismatch");
  const user = await verifyCloudBaseAccessToken(session.accessToken, fetcher, session.subject);
  return { session, user };
}

export async function validateCloudBaseSession(
  session: CloudBaseSession,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedCloudBaseSession> {
  if (session.expiresAt <= Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
    return refreshCloudBaseSession(session, fetcher);
  }
  let profile: Record<string, unknown>;
  try {
    profile = await readCloudBaseProfile(session.accessToken, fetcher);
  } catch (error) {
    if (!(error instanceof CloudBaseAuthError) || error.status !== 401) throw error;
    if (error.code === "user_blocked" || isCloudBaseInactiveAccountError(error)) throw error;
    return refreshCloudBaseSession(session, fetcher);
  }
  const user = await verifyCloudBaseProfile(profile, session.accessToken, fetcher, session.subject);
  return { session, user };
}

export async function signOutCloudBase(session: CloudBaseSession | null, fetcher: typeof fetch = fetch) {
  if (!session) return;
  await cloudBaseAuthRequest("/auth/v1/user/signout", {
    method: "POST",
    token: session.accessToken,
    deviceId: session.deviceId,
    body: {},
    fetcher,
  });
}

export function asCloudBaseAuthError(error: unknown) {
  if (error instanceof CloudBaseAuthError) return error;
  return new CloudBaseAuthError(503, "cloudbase_auth_error");
}
