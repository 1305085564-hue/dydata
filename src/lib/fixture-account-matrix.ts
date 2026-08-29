export type FixtureAccountRole = "member";

export type FixtureAccountSpec = {
  accountNo: 4 | 5 | 6;
  alias: string;
  name: string;
  role: FixtureAccountRole;
  companyRole: FixtureAccountRole;
  teamKey: "A" | "B";
  teamName: string;
  finalMembershipStatus: "active" | "archived";
};

/**
 * Batch 5 account matrix. The team IDs are resolved by the operational script
 * from the exact existing team names; no production IDs or credentials belong
 * in source control.
 */
export const BATCH5_FIXTURE_ACCOUNT_SPECS: readonly FixtureAccountSpec[] = [
  {
    accountNo: 4,
    alias: "批次5账号#4",
    name: "批次5-A组员2",
    role: "member",
    companyRole: "member",
    teamKey: "A",
    teamName: "深圳二部",
    finalMembershipStatus: "active",
  },
  {
    accountNo: 5,
    alias: "批次5账号#5",
    name: "批次5-B组员",
    role: "member",
    companyRole: "member",
    teamKey: "B",
    teamName: "页面1验证团队1124",
    finalMembershipStatus: "active",
  },
  {
    accountNo: 6,
    alias: "批次5账号#6",
    name: "批次5-归档成员",
    role: "member",
    companyRole: "member",
    teamKey: "A",
    teamName: "深圳二部",
    finalMembershipStatus: "archived",
  },
] as const;

export const BATCH5_TEAM_NAMES = {
  A: "深圳二部",
  B: "页面1验证团队1124",
} as const;

export function assertUniqueFixtureAliases(specs: readonly FixtureAccountSpec[]) {
  const aliases = specs.map((spec) => spec.alias);
  if (new Set(aliases).size !== aliases.length) {
    throw new Error("批次5账号代号重复，停止创建");
  }
}

export function buildFixtureEmail(accountNo: number, nonce: string) {
  const normalizedNonce = nonce.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!normalizedNonce) throw new Error("批次5账号邮箱随机段不能为空");
  return `dydata-batch5-${accountNo}-${normalizedNonce}@example.com`;
}

export function buildCredentialTableRow(input: {
  alias: string;
  email: string;
  password: string;
  role: FixtureAccountRole;
  verifiedDate: string;
}) {
  return `| ${input.alias} | ${input.email} | ${input.password} | ${input.role} | ${input.verifiedDate} |`;
}

export function isBannedUntil(bannedUntil: string | null | undefined, now = Date.now()) {
  if (!bannedUntil || bannedUntil === "none") return false;
  const timestamp = Date.parse(bannedUntil);
  return Number.isNaN(timestamp) || timestamp > now;
}
