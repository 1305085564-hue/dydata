import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildCompanyRoleProfilePatch } from "../src/lib/company-permissions";

type TestUserSpec = {
  alias: "组员" | "组长";
  name: string;
  role: "member" | "admin";
  emailEnv: string;
  passwordEnv: string;
};

type Credential = {
  email: string;
  password: string;
};

const TEST_USER_SPECS: TestUserSpec[] = [
  {
    alias: "组员",
    name: "测试组员",
    role: "member",
    emailEnv: "DYDATA_TEST_MEMBER_EMAIL",
    passwordEnv: "DYDATA_TEST_MEMBER_PASSWORD",
  },
  {
    alias: "组长",
    name: "测试组长",
    role: "admin",
    emailEnv: "DYDATA_TEST_LEADER_EMAIL",
    passwordEnv: "DYDATA_TEST_LEADER_PASSWORD",
  },
];

function parseCredentialFile(content: string): Map<string, Credential> {
  const credentials = new Map<string, Credential>();

  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.startsWith("|---")) continue;

    const columns = line
      .split("|")
      .slice(1, -1)
      .map((value) => value.trim());
    if (columns.length < 4 || columns[0] === "账号") continue;

    const [alias, email, password] = columns;
    if (alias && email && password) {
      credentials.set(alias, { email, password });
    }
  }

  return credentials;
}

function loadLocalCredentials(): Map<string, Credential> {
  const configuredPath = process.env.DYDATA_TEST_CREDENTIALS_FILE;
  const credentialsPath = configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), "docs/reference/测试账号.md");

  if (!fs.existsSync(credentialsPath)) return new Map();
  return parseCredentialFile(fs.readFileSync(credentialsPath, "utf8"));
}

function resolveCredential(spec: TestUserSpec, localCredentials: Map<string, Credential>): Credential | null {
  const localCredential = localCredentials.get(spec.alias);
  const email = process.env[spec.emailEnv] ?? localCredential?.email;
  const password = process.env[spec.passwordEnv] ?? localCredential?.password;

  return email && password ? { email, password } : null;
}

function loadCredentials(): Map<TestUserSpec["alias"], Credential> {
  const localCredentials = loadLocalCredentials();
  const resolved = new Map<TestUserSpec["alias"], Credential>();

  for (const spec of TEST_USER_SPECS) {
    const credential = resolveCredential(spec, localCredentials);
    if (credential) resolved.set(spec.alias, credential);
  }

  return resolved;
}

function isDryRun() {
  return process.argv.includes("--dry-run") || process.env.DYDATA_TEST_USERS_DRY_RUN === "1";
}

function printDryRun(credentials: Map<TestUserSpec["alias"], Credential>) {
  console.log("=== 创建测试账号 dry-run ===");
  for (const spec of TEST_USER_SPECS) {
    const loaded = credentials.has(spec.alias) ? "凭据已加载" : "缺少凭据";
    console.log(`${spec.alias}：${loaded}；role=${spec.role}；company_role=${spec.role}`);
  }
  console.log("dry-run 未执行 Auth 或 profiles 写入。");
}

async function createTestUsers() {
  const credentials = loadCredentials();

  if (isDryRun()) {
    printDryRun(credentials);
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("缺少 Supabase 服务端配置");
  }

  const missing = TEST_USER_SPECS.filter((spec) => !credentials.has(spec.alias));
  if (missing.length > 0) {
    throw new Error("缺少测试账号本地凭据");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("=== 创建测试账号 ===");
  for (const spec of TEST_USER_SPECS) {
    const credential = credentials.get(spec.alias);
    if (!credential) throw new Error("测试账号凭据解析失败");

    const { data, error } = await supabase.auth.admin.createUser({
      email: credential.email,
      password: credential.password,
      email_confirm: true,
      user_metadata: {
        name: spec.name,
        role: spec.role,
        company_role: spec.role,
      },
    });

    if (error || !data.user) {
      console.error(`${spec.alias}创建失败`);
      continue;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: data.user.id,
        name: spec.name,
        ...buildCompanyRoleProfilePatch(spec.role),
      });

    if (profileError) {
      console.error(`${spec.alias} Profile 同步失败`);
    } else {
      console.log(`${spec.alias}创建及 Profile 同步成功`);
    }
  }
}

createTestUsers().catch(() => {
  console.error("创建测试账号失败");
  process.exitCode = 1;
});
