import { redirect } from "next/navigation";

import { buildLoginPath, sanitizeNextPath } from "@/lib/auth-password";
import { ensureDefaultDashboardAccount } from "@/lib/dashboard-account-provisioning";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTeamOptions } from "@/lib/teams";

type RegisterFormState = {
  error: string | null;
};

type RegistrationError = { message?: string } | null;

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
};

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
  logError: console.error,
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function compensateFailedRegistration({
  supabase,
  adminSupabase,
  userId,
  stage,
  cause,
  logError,
}: {
  supabase: RegistrationServerClient;
  adminSupabase: RegistrationAdminClient | null;
  userId: string;
  stage: "admin-client" | "profile" | "account" | "join-request";
  cause: unknown;
  logError: RegisterDependencies["logError"];
}): Promise<RegisterFormState> {
  logError("Registration provisioning failed", { stage, userId, cause: getErrorMessage(cause) });

  let cleanupFailed = false;

  if (!adminSupabase) {
    cleanupFailed = true;
    logError("Registration compensation failed", { stage, userId, cause: "admin client unavailable" });
  } else {
    try {
      const { error } = await adminSupabase.auth.admin.deleteUser(userId);
      if (error) {
        cleanupFailed = true;
        logError("Registration compensation failed", { stage, userId, cause: error.message ?? "delete user failed" });
      }
    } catch (error) {
      cleanupFailed = true;
      logError("Registration compensation failed", { stage, userId, cause: getErrorMessage(error) });
    }
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      cleanupFailed = true;
      logError("Registration session cleanup failed", { stage, userId, cause: error.message ?? "sign out failed" });
    }
  } catch (error) {
    cleanupFailed = true;
    logError("Registration session cleanup failed", { stage, userId, cause: getErrorMessage(error) });
  }

  return cleanupFailed
    ? { error: "注册未能完成，账号清理遇到问题。请勿重复提交，请联系管理员处理。" }
    : { error: "注册未能完成，本次注册已撤销，请稍后重试。" };
}

export async function registerUser(
  _: RegisterFormState,
  formData: FormData,
  dependencies: RegisterDependencies = defaultRegisterDependencies,
  next?: string | null,
): Promise<RegisterFormState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const teamId = formData.get("teamId")?.toString().trim() ?? "";
  const teams = await dependencies.getTeamOptions();
  const selectedTeam = teams.find((team) => team.id === teamId);

  if (!name || !email || !password) return { error: "请完整填写姓名、邮箱和密码。" };
  if (password.length < 6) return { error: "密码至少需要 6 位。" };
  if (!selectedTeam) return { error: "请选择要申请加入的团队。" };

  const supabase = await dependencies.createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        pending_team_id: selectedTeam.id,
        pending_team_name: selectedTeam.name,
      },
    },
  });

  if (signUpError || !signUpData.user || signUpData.user.identities?.length === 0) {
    return { error: "注册失败，请稍后重试。" };
  }

  const userId = signUpData.user.id;
  const returnPath = sanitizeNextPath(next, "");
  let adminSupabase: RegistrationAdminClient;

  try {
    adminSupabase = dependencies.createAdminClient();
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase: null, userId, stage: "admin-client", cause: error, logError: dependencies.logError });
  }

  try {
    const { error } = await adminSupabase.from("profiles").insert({
      id: userId,
      name,
      role: "member",
      team_id: null,
      permissions: {},
    });
    if (error) throw new Error(error.message ?? "profile insert failed");
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase, userId, stage: "profile", cause: error, logError: dependencies.logError });
  }

  try {
    await dependencies.ensureDefaultDashboardAccount({ adminSupabase, profileId: userId, preferredName: name });
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase, userId, stage: "account", cause: error, logError: dependencies.logError });
  }

  try {
    const { error } = await adminSupabase.from("team_join_requests").insert({
      applicant_user_id: userId,
      target_team_id: selectedTeam.id,
    });
    if (error) throw new Error(error.message ?? "join request insert failed");
  } catch (error) {
    return compensateFailedRegistration({ supabase, adminSupabase, userId, stage: "join-request", cause: error, logError: dependencies.logError });
  }

  if (!signUpData.session) dependencies.redirect(buildLoginPath(returnPath, { registered: "1" }));
  dependencies.redirect(returnPath || "/dashboard?just_registered=1");
}
