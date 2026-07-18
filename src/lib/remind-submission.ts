import { getExemptionStateForDate, type ExemptionProfileLike } from "@/lib/豁免";

type SubmissionProfile = ExemptionProfileLike & {
  name: string;
  role: string;
};

type SubmissionAccount = {
  id: string;
  profile_id: string;
};

type SubmissionReport = {
  user_id: string | null;
  account_id: string | null;
  report_date: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getShanghaiDateString(now: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }

  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

export function shiftDateString(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function buildSubmissionStatus(params: {
  profiles: SubmissionProfile[];
  accounts: SubmissionAccount[];
  reports: SubmissionReport[];
  today: string;
}) {
  const accountOwnerById = new Map(params.accounts.map((account) => [account.id, account.profile_id]));
  const profileIdsWithAccounts = new Set(params.accounts.map((account) => account.profile_id));
  const submittedProfileIds = new Set<string>();

  for (const report of params.reports) {
    if (report.report_date !== params.today) {
      continue;
    }

    if (report.user_id) {
      submittedProfileIds.add(report.user_id);
    }

    if (report.account_id) {
      const ownerId = accountOwnerById.get(report.account_id);
      if (ownerId) {
        submittedProfileIds.add(ownerId);
      }
    }
  }

  return params.profiles
    .filter((profile) => profile.role === "member")
    .filter((profile) => profileIdsWithAccounts.has(profile.id))
    .filter((profile) => !getExemptionStateForDate(profile, params.today).isExempt)
    .map((profile) => ({
      user_id: profile.id,
      name: profile.name,
      submitted: submittedProfileIds.has(profile.id),
    }));
}

export function buildRecentSubmissionMap(params: {
  accounts: SubmissionAccount[];
  reports: SubmissionReport[];
}) {
  const accountOwnerById = new Map(params.accounts.map((account) => [account.id, account.profile_id]));
  const reportDatesByUser = new Map<string, Set<string>>();

  for (const report of params.reports) {
    const ownerIds = new Set<string>();
    if (report.user_id) {
      ownerIds.add(report.user_id);
    }
    if (report.account_id) {
      const ownerId = accountOwnerById.get(report.account_id);
      if (ownerId) {
        ownerIds.add(ownerId);
      }
    }

    for (const ownerId of ownerIds) {
      if (!reportDatesByUser.has(ownerId)) {
        reportDatesByUser.set(ownerId, new Set());
      }
      reportDatesByUser.get(ownerId)!.add(report.report_date);
    }
  }

  return reportDatesByUser;
}

export function buildMissingStreakMap(params: {
  userIds: string[];
  reportsByUser: Map<string, Set<string>>;
  today: string;
  days?: number;
}) {
  const maxDays = params.days ?? 7;
  const streakMap = new Map<string, number>();

  for (const userId of params.userIds) {
    const dates = params.reportsByUser.get(userId) ?? new Set<string>();
    let streak = 0;

    for (let offset = 0; offset < maxDays; offset += 1) {
      const date = shiftDateString(params.today, -offset);
      if (dates.has(date)) {
        break;
      }
      streak += 1;
    }

    if (streak >= 2) {
      streakMap.set(userId, streak);
    }
  }

  return streakMap;
}
