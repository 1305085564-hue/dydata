import { createHash, createHmac } from "node:crypto";

type CloudBaseUserStatus = "ACTIVE" | "BLOCKED";
type ModifyUserInput = { uid: string; userStatus: CloudBaseUserStatus };
type CloudBaseManagerConfig = { envId: string; secretId: string; secretKey: string; token?: string };
type SignedModifyUserRequest = { url: string; method: "POST"; headers: Record<string, string>; body: string };

const TC3_HOST = "tcb.tencentcloudapi.com";
const TC3_URL = `https://${TC3_HOST}/`;
const TC3_ACTION = "ModifyUser";
const TC3_VERSION = "2018-06-08";
const TC3_CONTENT_TYPE = "application/json; charset=utf-8";
const TC3_ALGORITHM = "TC3-HMAC-SHA256";

export type CloudBaseManagementClient = {
  user: {
    modifyUser(input: ModifyUserInput): Promise<{ Data?: { Success?: boolean } | null; RequestId?: string }>;
  };
};

type UserReadback = {
  user: unknown | null;
  error?: unknown | null;
};

export class CloudBaseManagementError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "CloudBaseManagementError";
    this.code = code;
    this.status = status;
  }
}

export function mapSupabaseBanDuration(value: unknown): CloudBaseUserStatus | null {
  if (value === "none") return "ACTIVE";
  // member-lifecycle-service uses this fixed maximum duration for archive operations.
  // CloudBase BLOCKED has no expiry, so other durations would silently change meaning.
  if (value !== "876000h") return null;
  return "BLOCKED";
}

export function getCloudBaseManagerConfig(env: NodeJS.ProcessEnv = process.env) {
  const envId = env.CLOUDBASE_ENV_ID;
  const secretId = env.CLOUDBASE_SECRET_ID;
  const secretKey = env.CLOUDBASE_SECRET_KEY;
  const token = env.CLOUDBASE_SESSION_TOKEN;
  if (!envId || !secretId || !secretKey) {
    throw new CloudBaseManagementError(
      "CloudBase 用户冻结/解冻未配置服务端凭据",
      "management_unconfigured",
      503,
    );
  }
  return {
    envId,
    secretId,
    secretKey,
    ...(token ? { token } : {}),
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

export function buildModifyUserRequest(
  config: CloudBaseManagerConfig,
  input: ModifyUserInput,
  timestampSeconds = Math.floor(Date.now() / 1_000),
): SignedModifyUserRequest {
  if (!config.envId || !config.secretId || !config.secretKey) {
    throw new CloudBaseManagementError("CloudBase 用户冻结/解冻未配置服务端凭据", "management_unconfigured", 503);
  }
  if (!input.uid || input.uid.length > 64 || input.uid.trim() !== input.uid || !["ACTIVE", "BLOCKED"].includes(input.userStatus)) {
    throw new CloudBaseManagementError("CloudBase 用户状态修改参数无效", "management_invalid_request");
  }
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
    throw new CloudBaseManagementError("CloudBase 用户状态修改时间无效", "management_invalid_request");
  }

  const timestamp = String(timestampSeconds);
  const date = new Date(timestampSeconds * 1_000).toISOString().slice(0, 10);
  const body = JSON.stringify({ EnvId: config.envId, Uid: input.uid, UserStatus: input.userStatus });
  const canonicalHeaderValues: Record<string, string> = {
    "content-type": TC3_CONTENT_TYPE,
    host: TC3_HOST,
    "x-tc-action": TC3_ACTION.toLowerCase(),
    ...(config.token ? { "x-tc-token": config.token } : {}),
  };
  const signedHeaders = Object.keys(canonicalHeaderValues).sort().join(";");
  const canonicalHeaders = Object.keys(canonicalHeaderValues)
    .sort()
    .map((name) => `${name}:${canonicalHeaderValues[name].trim().toLowerCase()}\n`)
    .join("");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");
  const credentialScope = `${date}/tcb/tc3_request`;
  const stringToSign = [
    TC3_ALGORITHM,
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacSha256(`TC3${config.secretKey}`, date);
  const secretService = hmacSha256(secretDate, "tcb");
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign).toString("hex");
  const authorization = `${TC3_ALGORITHM} Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: TC3_URL,
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": TC3_CONTENT_TYPE,
      Host: TC3_HOST,
      "X-TC-Action": TC3_ACTION,
      "X-TC-Timestamp": timestamp,
      "X-TC-Version": TC3_VERSION,
      ...(config.token ? { "X-TC-Token": config.token } : {}),
    },
    body,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createCloudBaseManagerClient(
  env: NodeJS.ProcessEnv = process.env,
  options: { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
): CloudBaseManagementClient {
  const config = getCloudBaseManagerConfig(env);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = Math.max(1, Math.min(10_000, Math.floor(options.timeoutMs ?? 8_000)));

  return {
    user: {
      async modifyUser(input) {
        const startedAt=Date.now();
        const request = buildModifyUserRequest(config, input, Math.floor((options.now?.() ?? Date.now()) / 1_000));
        let response: Response;
        try {
          response = await fetcher(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch {
          throw new CloudBaseManagementError("CloudBase 用户状态修改失败", "management_transport_failed", 502);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new CloudBaseManagementError("CloudBase 用户状态修改失败", "management_api_failed", 502);
        }
        if (!response.ok || !isRecord(payload) || !isRecord(payload.Response) || isRecord(payload.Response.Error)) {
          throw new CloudBaseManagementError("CloudBase 用户状态修改失败", "management_api_failed", 502);
        }

        const apiResponse = payload.Response;
        if (!isRecord(apiResponse.Data) || typeof apiResponse.Data.Success !== "boolean") {
          throw new CloudBaseManagementError("CloudBase 用户状态修改失败", "management_api_failed", 502);
        }
        console.info("[cloudbase-management]", JSON.stringify({ operation:"ModifyUser", environmentId:config.envId, startedAt, finishedAt:Date.now(), serverDate:response.headers.get('date'), success:apiResponse.Data.Success, requestId:typeof apiResponse.RequestId === "string" ? apiResponse.RequestId : null }));
        return {
          Data: { Success: apiResponse.Data.Success },
          ...(typeof apiResponse.RequestId === "string" ? { RequestId: apiResponse.RequestId } : {}),
        };
      },
    },
  };
}

function managementError(message: string, code: string, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

export function createCloudBaseUserManagement(dependencies: {
  createManager: () => CloudBaseManagementClient | Promise<CloudBaseManagementClient>;
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
    if (!userStatus) {
      return { data: { user: null }, error: managementError("封禁时长格式不受支持", "invalid_ban_duration") };
    }

    let manager: CloudBaseManagementClient;
    try {
      manager = await dependencies.createManager();
    } catch (error) {
      if (error instanceof CloudBaseManagementError) {
        return { data: { user: null }, error: managementError(error.message, error.code, error.status) };
      }
      return { data: { user: null }, error: managementError("CloudBase 用户管理服务暂时不可用", "management_unavailable", 503) };
    }

    try {
      const result = await manager.user.modifyUser({ uid: userId, userStatus });
      if (result.Data?.Success !== true) {
        return { data: { user: null }, error: managementError("CloudBase 未确认用户状态修改成功", "management_rejected", 502) };
      }
    } catch {
      return { data: { user: null }, error: managementError("CloudBase 用户状态修改失败", "management_failed", 502) };
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
        const matchesStatus = hasBanState && (userStatus === "BLOCKED"
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
      error: managementError("CloudBase 已受理状态修改，但 Auth 投影仍未同步；请稍后核实", "status_pending", 503),
    };
  }

  return { updateUserById };
}
