import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  BATCH5_FIXTURE_ACCOUNT_SPECS,
  BATCH5_TEAM_NAMES,
  assertUniqueFixtureAliases,
  buildCredentialTableRow,
  buildFixtureEmail,
  isBannedUntil,
  type FixtureAccountSpec,
} from "../src/lib/fixture-account-matrix";
import { fixedPermissionsForRole } from "../src/lib/company-permissions";
import { archiveMemberWithClient } from "../src/lib/member-lifecycle-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

type Credential = { email: string; password: string };
type TeamRow = { id: string; name: string };
type ProfileBaseline = {
  role: string | null;
  company_role: string | null;
  membership_status: string | null;
  team_id: string | null;
};
type CreatedAccount = {
  spec: FixtureAccountSpec;
  userId: string;
  credential: Credential;
  archiveLogCountBefore: number;
};

const BASELINE_ALIASES = ["阿禅", "组长", "组员"] as const;
const LOCAL_CREDENTIALS_PATH = path.resolve(
  process.env.DYDATA_TEST_CREDENTIALS_FILE ?? path.join(process.cwd(), "docs/reference/测试账号.md"),
);

function parseCredentialFile(content: string) {
  const credentials = new Map<string, Credential>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.startsWith("|---")) continue;
    const columns = line.split("|").slice(1, -1).map((value) => value.trim());
    if (columns.length < 4 || columns[0] === "账号") continue;
    const [alias, email, password] = columns;
    if (alias && email && password) credentials.set(alias, { email, password });
  }
  return credentials;
}

function requireLocalCredentialFile() {
  if (!fs.existsSync(LOCAL_CREDENTIALS_PATH)) {
    throw new Error("本地测试账号文件不存在，停止创建");
  }
  try {
    fs.accessSync(LOCAL_CREDENTIALS_PATH, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    throw new Error("本地测试账号文件不可读写，停止创建");
  }
  fs.chmodSync(LOCAL_CREDENTIALS_PATH, 0o600);
  return fs.readFileSync(LOCAL_CREDENTIALS_PATH, "utf8");
}

function randomPassword() {
  return crypto.randomBytes(32).toString("base64url");
}

function randomNonce() {
  return crypto.randomBytes(12).toString("hex");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

async function listAllAuthUsers(supabase: SupabaseClient) {
  const users: Array<{ id: string; email?: string | null; banned_until?: string | null }> = [];
  for (let page = 1; ; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error("读取 Auth 用户失败");
    const pageUsers = result.data.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) return users;
  }
}

function findExactAuthUser(
  users: Array<{ id: string; email?: string | null; banned_until?: string | null }>,
  email: string,
) {
  const matches = users.filter((user) => user.email === email);
  if (matches.length > 1) throw new Error("发现重复 Auth 用户，停止创建");
  return matches[0] ?? null;
}

async function loadExactTeamMap(supabase: SupabaseClient) {
  const names = [...new Set(Object.values(BATCH5_TEAM_NAMES))];
  const result = await supabase.from("teams").select("id, name").in("name", names);
  if (result.error) throw new Error("读取批次5团队失败");

  const teamMap = new Map<string, TeamRow>();
  for (const name of names) {
    const matches = ((result.data ?? []) as TeamRow[]).filter((team) => team.name === name);
    if (matches.length !== 1) throw new Error("批次5目标团队数量不唯一，停止创建");
    teamMap.set(name, matches[0]);
  }
  return teamMap;
}

async function countRows(query: PromiseLike<{ count: number | null; error: { message?: string } | null }>) {
  const result = await query;
  if (result.error) throw new Error("读取业务数据基线失败");
  return result.count ?? 0;
}

async function loadProfileBaseline(supabase: SupabaseClient, userId: string) {
  const result = await supabase
    .from("profiles")
    .select("role, company_role, membership_status, team_id")
    .eq("id", userId)
    .limit(2);
  if (result.error) throw new Error("读取既有账号 Profile 失败");
  const rows = result.data ?? [];
  if (rows.length !== 1) throw new Error("既有账号 Profile 数量不唯一，停止创建");
  const profile = rows[0] as ProfileBaseline;
  return {
    role: profile.role,
    company_role: profile.company_role,
    membership_status: profile.membership_status,
    team_id: profile.team_id,
  } satisfies ProfileBaseline;
}

async function assertNoBusinessRows(supabase: SupabaseClient, userIds: string[]) {
  const [reports, videos, claims, requests, grants, accounts] = await Promise.all([
    countRows(supabase.from("daily_reports").select("id", { count: "exact", head: true }).in("user_id", userIds)),
    countRows(supabase.from("videos").select("id", { count: "exact", head: true }).in("user_id", userIds)),
    countRows(supabase.from("sub_topic_claims").select("id", { count: "exact", head: true }).in("user_id", userIds)),
    countRows(supabase.from("exemption_request").select("id", { count: "exact", head: true }).in("applicant_user_id", userIds)),
    countRows(supabase.from("exemption_grant").select("id", { count: "exact", head: true }).in("user_id", userIds)),
    countRows(supabase.from("accounts").select("id", { count: "exact", head: true }).in("profile_id", userIds)),
  ]);
  if ([reports, videos, claims, requests, grants, accounts].some((count) => count !== 0)) {
    throw new Error("新账号出现业务数据，停止创建验收");
  }
}

async function loadBaselineAccountIds(
  supabase: SupabaseClient,
  users: Array<{ id: string; email?: string | null; banned_until?: string | null }>,
  credentials: Map<string, Credential>,
) {
  const result = new Map<string, { userId: string; profile: ProfileBaseline }>();
  for (const alias of BASELINE_ALIASES) {
    const credential = credentials.get(alias);
    if (!credential) throw new Error("既有账号凭据代号不完整，停止创建");
    const user = findExactAuthUser(users, credential.email);
    if (!user) throw new Error("既有账号 Auth 用户不存在，停止创建");
    result.set(alias, { userId: user.id, profile: await loadProfileBaseline(supabase, user.id) });
  }
  return result;
}

function assertBaselineUnchanged(
  current: ProfileBaseline,
  before: ProfileBaseline,
) {
  if (
    current.role !== before.role ||
    current.company_role !== before.company_role ||
    current.membership_status !== before.membership_status ||
    current.team_id !== before.team_id
  ) {
    throw new Error("账号#1–#3基线发生变化，停止验收");
  }
}

async function appendCredentials(credentials: Array<{ spec: FixtureAccountSpec; credential: Credential }>) {
  const content = fs.readFileSync(LOCAL_CREDENTIALS_PATH, "utf8");
  const verifiedDate = new Date().toISOString().slice(0, 10);
  const rows = credentials.map(({ spec, credential }) => buildCredentialTableRow({
    alias: spec.alias,
    email: credential.email,
    password: credential.password,
    role: spec.role,
    verifiedDate,
  }));
  const tempPath = `${LOCAL_CREDENTIALS_PATH}.batch5-${process.pid}-${randomNonce()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${content.trimEnd()}\n${rows.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, LOCAL_CREDENTIALS_PATH);
    fs.chmodSync(LOCAL_CREDENTIALS_PATH, 0o600);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

async function compensateCreatedAccounts(supabase: SupabaseClient, created: CreatedAccount[]) {
  let failed = false;
  for (const account of [...created].reverse()) {
    const result = await supabase.auth.admin.deleteUser(account.userId);
    if (result.error) failed = true;
  }
  return failed;
}

async function run() {
  if (process.argv.includes("--dry-run")) {
    assertUniqueFixtureAliases(BATCH5_FIXTURE_ACCOUNT_SPECS);
    console.log("批次5账号矩阵 dry-run：账号#4 A在职组员、账号#5 B在职组员、账号#6 A归档组员；未执行 Auth/Profile 写入。");
    return;
  }

  assertUniqueFixtureAliases(BATCH5_FIXTURE_ACCOUNT_SPECS);
  const localContent = requireLocalCredentialFile();
  const localCredentials = parseCredentialFile(localContent);
  for (const spec of BATCH5_FIXTURE_ACCOUNT_SPECS) {
    if (localCredentials.has(spec.alias)) throw new Error("批次5账号代号已存在，拒绝覆盖并停止");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("缺少 Supabase 服务端配置");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [authUsers, teamMap] = await Promise.all([listAllAuthUsers(supabase), loadExactTeamMap(supabase)]);
  const baseline = await loadBaselineAccountIds(supabase, authUsers, localCredentials);
  const teamA = teamMap.get(BATCH5_TEAM_NAMES.A);
  const teamB = teamMap.get(BATCH5_TEAM_NAMES.B);
  if (!teamA || !teamB) throw new Error("批次5团队解析失败");

  const teamBActiveCount = await countRows(
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("team_id", teamB.id).eq("membership_status", "active"),
  );
  if (teamBActiveCount !== 0) throw new Error("团队B已有在职成员，拒绝改变现有矩阵并停止");

  const generated = BATCH5_FIXTURE_ACCOUNT_SPECS.map((spec) => ({
    spec,
    credential: {
      email: buildFixtureEmail(spec.accountNo, randomNonce()),
      password: randomPassword(),
    },
  }));
  for (const account of generated) {
    if (findExactAuthUser(authUsers, account.credential.email)) throw new Error("随机邮箱已存在，停止创建");
    const existingName = await supabase.from("profiles").select("id").eq("name", account.spec.name).limit(2);
    if (existingName.error) throw new Error("检查新账号 Profile 基线失败");
    if ((existingName.data ?? []).length > 0) throw new Error("新账号 Profile 名称已存在，停止覆盖");
  }

  const created: CreatedAccount[] = [];
  let credentialsPersisted = false;
  try {
    for (const account of generated) {
      const team = teamMap.get(account.spec.teamName);
      if (!team) throw new Error("新账号团队解析失败");
      const authResult = await supabase.auth.admin.createUser({
        email: account.credential.email,
        password: account.credential.password,
        email_confirm: true,
        user_metadata: {
          name: account.spec.name,
          role: account.spec.role,
          company_role: account.spec.companyRole,
          team_id: team.id,
          team_name: team.name,
        },
      });
      if (authResult.error || !authResult.data.user) throw new Error("Auth 创建失败");
      const userId = authResult.data.user.id;
      const profileResult = await supabase.from("profiles").insert({
        id: userId,
        name: account.spec.name,
        role: account.spec.role,
        company_role: account.spec.companyRole,
        permissions: {},
        status: "active",
        membership_status: "active",
        team_id: team.id,
      }).select("id").single();
      if (profileResult.error || !profileResult.data?.id) throw new Error("Profile 创建失败");
      const archiveCount = await countRows(
        supabase.from("member_change_log").select("id", { count: "exact", head: true }).eq("profile_id", userId).eq("action_type", "archive"),
      );
      created.push({ spec: account.spec, userId, credential: account.credential, archiveLogCountBefore: archiveCount });
    }

    const archiveTarget = created.find((account) => account.spec.accountNo === 6);
    const owner = baseline.get("阿禅");
    if (!archiveTarget || !owner) throw new Error("归档验收前置账号缺失");
    const archiveResult = await archiveMemberWithClient({
      client: supabase,
      actor: {
        id: owner.userId,
        role: "owner",
        permissions: fixedPermissionsForRole("company_owner"),
        teamId: teamA.id,
        groupMode: false,
      },
      targetId: archiveTarget.userId,
      reason: "批次5归档成员样本",
      archivedAt: new Date().toISOString(),
    });
    if (!archiveResult.ok) throw new Error("账号#6既有归档链路失败");

    const afterAuthUsers = await listAllAuthUsers(supabase);
    for (const account of created) {
      const authUser = findExactAuthUser(afterAuthUsers, account.credential.email);
      if (!authUser) throw new Error("新账号 Auth 核验缺失");
      const profileResult = await supabase
        .from("profiles")
        .select("id, role, company_role, membership_status, team_id")
        .eq("id", account.userId)
        .limit(2);
      if (profileResult.error || (profileResult.data ?? []).length !== 1) throw new Error("新账号 Profile 数量核验失败");
      const profile = profileResult.data?.[0] as ProfileBaseline & { id: string };
      const expectedTeamId = account.spec.accountNo === 5 ? teamB.id : account.spec.accountNo === 6 ? null : teamA.id;
      if (
        profile.role !== "member" ||
        profile.company_role !== "member" ||
        profile.membership_status !== account.spec.finalMembershipStatus ||
        profile.team_id !== expectedTeamId
      ) throw new Error("新账号 Profile 矩阵核验失败");
      if (account.spec.accountNo === 6 && !isBannedUntil(authUser.banned_until)) throw new Error("账号#6 Auth 未封禁");
      if (account.spec.accountNo !== 6 && isBannedUntil(authUser.banned_until)) throw new Error("在职新账号不应被封禁");
      if (account.spec.accountNo === 6) {
        const archiveCountAfter = await countRows(
          supabase.from("member_change_log").select("id", { count: "exact", head: true }).eq("profile_id", account.userId).eq("action_type", "archive"),
        );
        if (archiveCountAfter !== account.archiveLogCountBefore + 1) throw new Error("账号#6成员变更审计缺失");
      }
    }

    for (const { userId, profile: before } of baseline.values()) {
      const current = await loadProfileBaseline(supabase, userId);
      assertBaselineUnchanged(current, before);
    }
    await assertNoBusinessRows(supabase, created.map((account) => account.userId));
    await appendCredentials(generated);
    credentialsPersisted = true;
    console.log("批次5账号矩阵创建并核验通过：账号#4/5在职、账号#6已走归档链路；未产生业务夹具。");
  } catch (error) {
    if (!credentialsPersisted) {
      const compensationFailed = await compensateCreatedAccounts(supabase, created);
      if (compensationFailed) throw new Error("批次5账号创建失败，精确补偿删除未完成，请停止后人工核对");
    }
    throw new Error(getErrorMessage(error));
  }
}

run().catch(() => {
  console.error("批次5账号矩阵执行失败；未输出凭据或 Auth ID。");
  process.exitCode = 1;
});
