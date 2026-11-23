import { redirect } from "next/navigation";

import { logApiError } from "@/lib/api-logger";
import { sanitizeNextPath } from "@/lib/auth-password";
import { cloudBaseEnvironmentId } from "@/lib/cloudbase/core";
import {
  registerCloudBaseEmployee,
  rollbackCloudBaseEmployee,
  runCloudBaseRegistrationFlow,
  type CloudBaseRegistrationRpcClient,
} from "@/lib/cloudbase/registration";
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
  rpc?: CloudBaseRegistrationRpcClient["rpc"];
};

export type RegisterDependencies = {
  getTeamOptions: typeof getTeamOptions;
  createClient: () => Promise<RegistrationServerClient>;
  createAdminClient: () => RegistrationAdminClient;
  redirect: typeof redirect;
  logError: (...args: unknown[]) => void;
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
