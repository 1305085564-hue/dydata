import { redirect } from "next/navigation";

import { logApiError } from "@/lib/api-logger";
import { buildLoginPath, sanitizeNextPath } from "@/lib/auth-password";
import { cloudBaseEnvironmentId, isCloudBaseBackend } from "@/lib/cloudbase/core";
import {
  registerCloudBaseEmployee,
  rollbackCloudBaseEmployee,
  runCloudBaseRegistrationFlow,
  type CloudBaseRegistrationRpcClient,
} from "@/lib/cloudbase/registration";
import { ensureDefaultDashboardAccount } from "@/lib/dashboard-account-provisioning";
import { createRequestContext } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTeamOptions } from "@/lib/teams";

type RegisterFormState = {
  error: string | null;
};

type RegistrationError = { message?: string; code?: string; status?: number } | null;

type RegistrationServerClient = {
  auth: {
    signUp(input: {
      email: string;
      password: string;
      options: { data: Record<string, string> };
    }): Promise<{
      data: { user: { id: string; identities?: unknown[] | null } | null; session: unknown | null };
      error: RegistrationError;
    }>;
    signInWithPassword?(credentials: {
      email?: string;
      phone?: string;
      password: string;
    }): Promise<{
      data: { user: { id: string } | null; session: unknown | null };
      error: RegistrationError;
    }>;
    signOut(): Promise<{ error: RegistrationError }>;
  };
};

type RegistrationAdminClient = {
  auth: {
    admin: {
      deleteUser(userId: string): Promise<{ error: RegistrationError }>;
    };
  };
  from(table: "profiles" | "team_join_requests"): {
    insert(values: Record<string, unknown>): Promise<{ error: RegistrationError }>;
  };
  rpc?: CloudBaseRegistrationRpcClient["rpc"];
};

export type RegisterDependencies = {
  getTeamOptions: typeof getTeamOptions;
  createClient: () => Promise<RegistrationServerClient>;
  createAdminClient: () => RegistrationAdminClient;
  ensureDefaultDashboardAccount: (input: {
    adminSupabase: unknown;
    profileId: string;
    preferredName: string;
  }) => Promise<{ created: boolean }>;
  redirect: typeof redirect;
  logError: (...args: unknown[]) => void;
  isCloudBaseBackend?: () => boolean;
  getCloudBaseProject?: () => string;
  registerCloudBaseEmployee?: typeof registerCloudBaseEmployee;
  rollbackCloudBaseEmployee?: typeof rollbackCloudBaseEmployee;
  createRequestId?: () => string;
};

function createRegistrationRequestId() {
  return createRequestContext({ route: "/register", operation: "register_employee" }).requestId;
}

const defaultRegisterDependencies: RegisterDependencies = {
  getTeamOptions,
  createClient: async () => (await createClient()) as unknown as RegistrationServerClient,
  createAdminClient: () => createAdminClient() as unknown as RegistrationAdminClient,
  ensureDefaultDashboardAccount: async ({ adminSupabase, profileId, preferredName }) =>
    ensureDefaultDashboardAccount({
      adminSupabase: adminSupabase as never,
      profileId,
      preferredName,
    }),
  redirect,
  logError: (label: unknown, detail?: unknown) => {
    const record = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
    const requestId = typeof record.requestId === "string" ? record.requestId : createRegistrationRequestId();
    const outcome = typeof record.outcome === "string" ? record.outcome : "registration_failed";
    const userId = typeof record.userId === "string" ? record.userId : undefined;
    const stage = typeof record.stage === "string" ? record.stage : "unknown";
    logApiError(
      {
        requestId,
        route: "/register",
        method: "POST",
        outcome,
        ...(userId ? { userId } : {}),
        detail: { stage },
      },
      record.cause ?? label,
    );
  },
  isCloudBaseBackend,
  getCloudBaseProject: cloudBaseEnvironmentId,
  registerCloudBaseEmployee,
  rollbackCloudBaseEmployee,
  createRequestId: createRegistrationRequestId,
};

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

function recordFailure(
  logError: RegisterDependencies["logError"],
  entry: { requestId: string; stage: string; outcome: string; userId?: string; cause: unknown },
) {
  logError("Registration failed", {
    requestId: entry.requestId,
    stage: entry.stage,
    outcome: entry.outcome,
    ...(entry.userId ? { userId: entry.userId } : {}),
    cause: getErrorMessage(entry.cause),
  });
}

function isDuplicateSupabaseEmail(error: RegistrationError, user: { identities?: unknown[] | null } | null) {
  if (user && user.identities?.length === 0) return true;
  if (!error) return false;
  return error.code === "user_already_exists" || /already\s+registered|already\s+exists|duplicate/i.test(error.message ?? "");
}

async function compensateFailedRegistration({
  supabase,
  adminSupabase,
  userId,
  requestId,
  stage,
  cause,
  logError,
}: {
  supabase: RegistrationServerClient;
  adminSupabase: RegistrationAdminClient | null;
  userId: string;
  requestId: string;
  stage: "admin-client" | "profile" | "account" | "join-request";
  cause: unknown;
  logError: RegisterDependencies["logError"];
}): Promise<RegisterFormState> {
  recordFailure(logError, { requestId, stage, outcome: "provisioning_failed", userId, cause });

  let cleanupFailed = false;
  if (!adminSupabase) {
    cleanupFailed = true;
    recordFailure(logError, { requestId, stage: `${stage}-compensation`, outcome: "compensation_failed", userId, cause: "admin client unavailable" });
  } else {
    try {
      const { error } = await adminSupabase.auth.admin.deleteUser(userId);
      if (error) {
        cleanupFailed = true;
        recordFailure(logError, { requestId, stage: `${stage}-compensation`, outcome: "compensation_failed", userId, cause: error.message ?? "delete user failed" });
      }
    } catch (error) {
      cleanupFailed = true;
      recordFailure(logError, { requestId, stage: `${stage}-compensation`, outcome: "compensation_failed", userId, cause: error });
    }
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      cleanupFailed = true;
      recordFailure(logError, { requestId, stage: `${stage}-session-cleanup`, outcome: "session_cleanup_failed", userId, cause: error.message ?? "sign out failed" });
    }
  } catch (error) {
    cleanupFailed = true;
    recordFailure(logError, { requestId, stage: `${stage}-session-cleanup`, outcome: "session_cleanup_failed", userId, cause: error });
  }

  return cleanupFailed
    ? { error: withRequestId("注册未能完成，账号清理遇到问题，请勿重复提交并联系管理员处理", requestId) }
    : { error: withRequestId("员工资料初始化失败，本次注册已撤销，请稍后重试", requestId) };
}

export async function registerUser(
  _: RegisterFormState,
  formData: FormData,
  dependencies: RegisterDependencies = defaultRegisterDependencies,
  next?: string | null,
): Promise<RegisterFormState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const email = (formData.get("email")?.toString().trim() ?? "").toLowerCase();
  const password = formData.get("password")?.toString() ?? "";
  const teamId = formData.get("teamId")?.toString().trim() ?? "";

  if (!name || !email || !password) return { error: "请完整填写姓名、邮箱和密码。" };
  if (name.length > 100) return { error: "姓名太长，最多 100 个字符" };
  if (email.length > 64) return { error: "邮箱太长，最多 64 个字符" };
  if (!email.includes("@") || /\s/.test(email)) return { error: "请输入有效的邮箱地址。" };
  if (password.length < 6) return { error: "密码至少需要 6 位。" };
  if (Buffer.byteLength(password, "utf8") > 72) return { error: "密码长度不能超过 72 位。" };
  if (!teamId) return { error: "还没选要申请加入的团队。" };

  const requestId = (dependencies.createRequestId ?? createRegistrationRequestId)();
  let teams: Awaited<ReturnType<typeof getTeamOptions>>;
  try {
    teams = await dependencies.getTeamOptions();
  } catch (error) {
    recordFailure(dependencies.logError, {
      requestId,
      stage: "team-options",
      outcome: "team_options_failed",
      cause: error,
    });
    return { error: withRequestId("团队列表加载失败，请稍后重试或联系管理员", requestId) };
  }

  const selectedTeam = teams.find((team) => team.id === teamId);
  if (!selectedTeam) return { error: "还没选要申请加入的团队。" };

  const returnPath = sanitizeNextPath(next, "");

  if ((dependencies.isCloudBaseBackend ?? isCloudBaseBackend)()) {
    // 依赖腾讯云内部密码存储格式；如果自检开始失败，改用官方 CreateUser（方案 B）
    const cloudBaseResult = await runCloudBaseRegistrationFlow({
      name,
      email,
      password,
      teamId: selectedTeam.id,
      requestId,
      createAdminClient: dependencies.createAdminClient,
      createServerClient: dependencies.createClient,
      getCloudBaseProject: dependencies.getCloudBaseProject ?? cloudBaseEnvironmentId,
      registerEmployee: dependencies.registerCloudBaseEmployee ?? registerCloudBaseEmployee,
      rollbackEmployee: dependencies.rollbackCloudBaseEmployee ?? rollbackCloudBaseEmployee,
      recordFailure: (entry) => recordFailure(dependencies.logError, entry),
    });
    if (!cloudBaseResult.ok) return { error: cloudBaseResult.error };
    dependencies.redirect(returnPath || "/dashboard?just_registered=1");
  }

  const supabase = await dependencies.createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, pending_team_id: selectedTeam.id, pending_team_name: selectedTeam.name } },
  });

  if (signUpError || !signUpData.user || signUpData.user.identities?.length === 0) {
    const duplicate = isDuplicateSupabaseEmail(signUpError, signUpData.user);
    recordFailure(dependencies.logError, {
      requestId,
      stage: "supabase-signup",
      outcome: duplicate ? "email_already_exists" : "account_create_failed",
      cause: signUpError?.message ?? (duplicate ? "duplicate_email" : "empty_user"),
    });
    return {
      error: duplicate
        ? withRequestId("这个邮箱已经注册过，请直接登录或联系管理员", requestId)
        : withRequestId("账号创建失败，请稍后重试或联系管理员", requestId),
    };
  }

  const userId = signUpData.user.id;
  let adminSupabase: RegistrationAdminClient;

  try {
    adminSupabase = dependencies.createAdminClient();
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase: null, userId, requestId, stage: "admin-client", cause: error, logError: dependencies.logError });
  }

  try {
    const { error } = await adminSupabase.from("profiles").insert({ id: userId, name, role: "member", team_id: null, permissions: {} });
    if (error) throw new Error(error.message ?? "profile insert failed");
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase, userId, requestId, stage: "profile", cause: error, logError: dependencies.logError });
  }

  try {
    await dependencies.ensureDefaultDashboardAccount({ adminSupabase, profileId: userId, preferredName: name });
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase, userId, requestId, stage: "account", cause: error, logError: dependencies.logError });
  }

  try {
    const { error } = await adminSupabase.from("team_join_requests").insert({ applicant_user_id: userId, target_team_id: selectedTeam.id });
    if (error) throw new Error(error.message ?? "join request insert failed");
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase, userId, requestId, stage: "join-request", cause: error, logError: dependencies.logError });
  }

  if (!signUpData.session) dependencies.redirect(buildLoginPath(returnPath, { registered: "1" }));
  dependencies.redirect(returnPath || "/dashboard?just_registered=1");
}
