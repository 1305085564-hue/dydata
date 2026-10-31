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
  const tokenResponse = await cloudBaseAuthRequest("/auth/v1/signin", {
    method: "POST",
    body: { username, password },
    fetcher,
  });
  const session = makeCloudBaseSession(unwrapToken(tokenResponse));
  const profile = await cloudBaseAuthRequest<Record<string, unknown>>("/auth/v1/user/me", {
    token: session.accessToken,
    fetcher,
  });
  const user = mapCloudBaseUser(profile);
  if (user.id !== session.subject) throw new CloudBaseAuthError(401, "subject_mismatch");
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
      fetcher,
    });
  } catch (error) {
    if (error instanceof CloudBaseAuthError && error.status >= 400 && error.status < 500) {
      throw new CloudBaseAuthError(401, "invalid_refresh_token");
    }
    throw error;
  }
  const session = makeCloudBaseSession(unwrapToken(tokenResponse));
  if (session.subject !== previous.subject) throw new CloudBaseAuthError(401, "subject_mismatch");
  const profile = await cloudBaseAuthRequest<Record<string, unknown>>("/auth/v1/user/me", {
    token: session.accessToken,
    fetcher,
  });
  const user = mapCloudBaseUser(profile);
  if (user.id !== session.subject) throw new CloudBaseAuthError(401, "subject_mismatch");
  return { session, user };
}

export async function validateCloudBaseSession(
  session: CloudBaseSession,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedCloudBaseSession> {
  if (session.expiresAt <= Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
    return refreshCloudBaseSession(session, fetcher);
  }
  try {
    const profile = await cloudBaseAuthRequest<Record<string, unknown>>("/auth/v1/user/me", {
      token: session.accessToken,
      fetcher,
    });
    const user = mapCloudBaseUser(profile);
    if (user.id !== session.subject) throw new CloudBaseAuthError(401, "subject_mismatch");
    return { session, user };
  } catch (error) {
    if (!(error instanceof CloudBaseAuthError) || error.status !== 401) throw error;
    if (error.code === "user_blocked") throw error;
    return refreshCloudBaseSession(session, fetcher);
  }
}

export async function signOutCloudBase(session: CloudBaseSession | null, fetcher: typeof fetch = fetch) {
  if (!session) return;
  await cloudBaseAuthRequest("/auth/v1/user/signout", {
    method: "POST",
    token: session.accessToken,
    body: {},
    fetcher,
  });
}

export function asCloudBaseAuthError(error: unknown) {
  if (error instanceof CloudBaseAuthError) return error;
  return new CloudBaseAuthError(503, "cloudbase_auth_error");
}
