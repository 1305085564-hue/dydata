type RpcErrorLike = { message?: string; code?: string } | null;
type AuthErrorLike = { message?: string; code?: string; status?: number } | null;

export type CloudBaseRegistrationRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcErrorLike }>;
};

export type CloudBaseRegisterErrorCode =
  | "email_already_exists"
  | "invalid_input"
  | "invalid_team"
  | "account_create_failed";

export type CloudBaseRegisterResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; code: CloudBaseRegisterErrorCode; detail: string };

export type CloudBaseRollbackResult =
  | { ok: true }
  | { ok: false; detail: string };

type CloudBaseSelfCheckClient = {
  auth: {
    signInWithPassword?(credentials: {
      email?: string;
      phone?: string;
      password: string;
    }): Promise<{
      data: { user: { id: string } | null; session: unknown | null };
      error: AuthErrorLike;
    }>;
    signOut(): Promise<{ error: AuthErrorLike }>;
  };
};

type FailureRecorder = (entry: {
  requestId: string;
  stage: string;
  outcome: string;
  userId?: string;
  cause: unknown;
}) => void;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function withRequestId(message: string, requestId: string) {
  return `${message}（编号 ${requestId}）`;
}

function classifyRpcError(error: NonNullable<RpcErrorLike>): {
  code: CloudBaseRegisterErrorCode;
  detail: string;
} {
  const errorCode = error.code ?? "";
  const message = error.message ?? "rpc_failed";
  if (errorCode === "23505" || /duplicate|unique/i.test(message)) {
    return { code: "email_already_exists", detail: `${errorCode || "unique_violation"}:${message}` };
  }
  return { code: "account_create_failed", detail: `${errorCode || "rpc_error"}:${message}` };
}

function normalizeRegisterCode(code: unknown): CloudBaseRegisterErrorCode {
  if (code === "email_already_exists" || code === "invalid_input" || code === "invalid_team") {
    return code;
  }
  return "account_create_failed";
}

// 依赖腾讯云内部密码存储格式；如果自检开始失败，改用官方 CreateUser（方案 B）
export async function registerCloudBaseEmployee(
  adminClient: CloudBaseRegistrationRpcClient,
  input: {
    project: string;
    email: string;
    password: string;
    name: string;
    teamId: string;
  },
): Promise<CloudBaseRegisterResult> {
  const { data, error } = await adminClient.rpc("cloudbase_register_employee", {
    p_project: input.project,
    p_email: input.email,
    p_password: input.password,
    p_name: input.name,
    p_team_id: input.teamId,
  });

  if (error) {
    const classified = classifyRpcError(error);
    return { ok: false, code: classified.code, detail: classified.detail };
  }

  const payload = readRecord(data);
  if (!payload) {
    return { ok: false, code: "account_create_failed", detail: "empty_rpc_payload" };
  }

  if (payload.ok === true) {
    const userId = typeof payload.user_id === "string" ? payload.user_id : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!UUID_PATTERN.test(userId) || !email) {
      return { ok: false, code: "account_create_failed", detail: "invalid_rpc_user_payload" };
    }
    return { ok: true, userId, email };
  }

  const code = normalizeRegisterCode(payload.code);
  const detail = typeof payload.detail === "string" && payload.detail
    ? payload.detail
    : typeof payload.code === "string" && payload.code
      ? payload.code
      : "rpc_rejected";
  return { ok: false, code, detail };
}

export async function rollbackCloudBaseEmployee(
  adminClient: CloudBaseRegistrationRpcClient,
  input: {
    project: string;
    userId: string;
    email: string;
  },
): Promise<CloudBaseRollbackResult> {
  const { data, error } = await adminClient.rpc("cloudbase_rollback_registered_employee", {
    p_project: input.project,
    p_user_id: input.userId,
    p_email: input.email,
  });

  if (error) {
    return { ok: false, detail: `${error.code || "rpc_error"}:${error.message ?? "rollback_failed"}` };
  }

  const payload = readRecord(data);
  if (payload?.ok === true && payload.deleted_auth === 1) {
    return { ok: true };
  }

  const detail = typeof payload?.detail === "string" && payload.detail
    ? payload.detail
    : typeof payload?.code === "string" && payload.code
      ? payload.code
      : "rollback_not_confirmed";
  return { ok: false, detail };
}

export async function runCloudBaseRegistrationFlow(input: {
  name: string;
  email: string;
  password: string;
  teamId: string;
  requestId: string;
  createAdminClient: () => { rpc?: CloudBaseRegistrationRpcClient["rpc"] };
  createServerClient: () => Promise<CloudBaseSelfCheckClient>;
  getCloudBaseProject: () => string;
  registerEmployee: typeof registerCloudBaseEmployee;
  rollbackEmployee: typeof rollbackCloudBaseEmployee;
  recordFailure: FailureRecorder;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  let adminSupabase: { rpc?: CloudBaseRegistrationRpcClient["rpc"] };
  let project: string;
  try {
    adminSupabase = input.createAdminClient();
    project = input.getCloudBaseProject();
  } catch (error) {
    input.recordFailure({
      requestId: input.requestId,
      stage: "cloudbase-admin-client",
      outcome: "admin_client_unavailable",
      cause: error,
    });
    return { ok: false, error: withRequestId("注册服务暂时不可用，请稍后重试或联系管理员", input.requestId) };
  }

  if (typeof adminSupabase.rpc !== "function") {
    input.recordFailure({
      requestId: input.requestId,
      stage: "cloudbase-admin-client",
      outcome: "rpc_unavailable",
      cause: "admin client missing rpc",
    });
    return { ok: false, error: withRequestId("注册服务暂时不可用，请稍后重试或联系管理员", input.requestId) };
  }

  const rpcClient = adminSupabase as CloudBaseRegistrationRpcClient;

  // 依赖腾讯云内部密码存储格式；如果自检开始失败，改用官方 CreateUser（方案 B）
  let created: CloudBaseRegisterResult;
  try {
    created = await input.registerEmployee(rpcClient, {
      project,
      email: input.email,
      password: input.password,
      name: input.name,
      teamId: input.teamId,
    });
  } catch (error) {
    input.recordFailure({
      requestId: input.requestId,
      stage: "cloudbase-register",
      outcome: "account_create_threw",
      cause: error,
    });
    return { ok: false, error: withRequestId("账号创建失败，请稍后重试或联系管理员", input.requestId) };
  }

  if (!created.ok) {
    input.recordFailure({
      requestId: input.requestId,
      stage: "cloudbase-register",
      outcome: created.code,
      cause: created.detail,
    });
    if (created.code === "email_already_exists") {
      return { ok: false, error: withRequestId("这个邮箱已经注册过，请直接登录或联系管理员", input.requestId) };
    }
    if (created.code === "invalid_team") {
      return { ok: false, error: withRequestId("所选团队不存在或已停用，请刷新页面重选", input.requestId) };
    }
    if (created.code === "invalid_input") {
      return { ok: false, error: withRequestId("提交的注册信息不符合要求，请检查后重试", input.requestId) };
    }
    return { ok: false, error: withRequestId("账号创建失败，请稍后重试或联系管理员", input.requestId) };
  }

  const { userId, email: registeredEmail } = created;
  let serverClient: CloudBaseSelfCheckClient | null = null;
  let selfCheckFailure: string | null = null;

  try {
    serverClient = await input.createServerClient();
    if (typeof serverClient.auth.signInWithPassword !== "function") {
      selfCheckFailure = "server client missing signInWithPassword";
    } else {
      const signInResult = await serverClient.auth.signInWithPassword({
        email: registeredEmail,
        password: input.password,
      });
      if (signInResult.error) {
        selfCheckFailure = `${signInResult.error.code ?? "signin_error"}:${signInResult.error.message ?? "login self-check failed"}`;
      } else if (signInResult.data.user?.id !== userId) {
        selfCheckFailure = `subject_mismatch:${signInResult.data.user?.id ?? "null"}`;
      }
    }
  } catch (error) {
    selfCheckFailure = getErrorMessage(error);
  }

  if (selfCheckFailure !== null) {
    input.recordFailure({
      requestId: input.requestId,
      stage: "cloudbase-login-self-check",
      outcome: "self_check_failed",
      userId,
      cause: selfCheckFailure,
    });

    if (serverClient) {
      try {
        const { error: signOutError } = await serverClient.auth.signOut();
        if (signOutError) {
          input.recordFailure({
            requestId: input.requestId,
            stage: "cloudbase-self-check-signout",
            outcome: "session_cleanup_failed",
            userId,
            cause: signOutError.message ?? "sign out failed",
          });
        }
      } catch (signOutError) {
        input.recordFailure({
          requestId: input.requestId,
          stage: "cloudbase-self-check-signout",
          outcome: "session_cleanup_failed",
          userId,
          cause: signOutError,
        });
      }
    }

    try {
      const rollback = await input.rollbackEmployee(rpcClient, {
        project,
        userId,
        email: registeredEmail,
      });
      if (!rollback.ok) {
        input.recordFailure({
          requestId: input.requestId,
          stage: "cloudbase-rollback",
          outcome: "rollback_failed",
          userId,
          cause: rollback.detail,
        });
      }
    } catch (rollbackError) {
      input.recordFailure({
        requestId: input.requestId,
        stage: "cloudbase-rollback",
        outcome: "rollback_threw",
        userId,
        cause: rollbackError,
      });
    }

    return { ok: false, error: withRequestId("注册失败，请联系管理员", input.requestId) };
  }

  return { ok: true, userId };
}
