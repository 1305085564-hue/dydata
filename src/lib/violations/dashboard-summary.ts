export type DashboardCaseRow = {
  id: string;
  script_text: string | null;
  pass_count: number | null;
  fail_count: number | null;
};

export type DashboardCaseSummary = {
  id: string;
  script_text: string;
  pass_count: number;
  fail_count: number;
  pass_rate: number | null;
};

export type DashboardRecentRow = {
  id: string;
  script_text: string | null;
  created_at: string;
  risk_level: string | null;
  submitter: { name: string | null } | Array<{ name: string | null }> | null;
};

export function calculatePassRate(passCount: number | null, failCount: number | null) {
  const pass = passCount ?? 0;
  const fail = failCount ?? 0;
  const total = pass + fail;
  if (total <= 0) return null;
  return Math.round((pass * 100) / total);
}

export function getUtcWeekStartIso(now = new Date()) {
  const utcDay = now.getUTCDay() || 7;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - utcDay + 1,
      0,
      0,
      0,
      0,
    ),
  ).toISOString();
}

function normalizeScriptText(scriptText: string | null, maxLength = 80) {
  const trimmed = (scriptText ?? "").trim();
  if (!trimmed) return "";
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
}

function toDashboardCaseSummary(row: DashboardCaseRow): DashboardCaseSummary {
  return {
    id: row.id,
    script_text: normalizeScriptText(row.script_text),
    pass_count: row.pass_count ?? 0,
    fail_count: row.fail_count ?? 0,
    pass_rate: calculatePassRate(row.pass_count, row.fail_count),
  };
}

function hasEnoughSamples(row: DashboardCaseRow) {
  return (row.pass_count ?? 0) + (row.fail_count ?? 0) >= 3;
}

export function selectDangerousTop3(rows: DashboardCaseRow[]) {
  return rows
    .filter(hasEnoughSamples)
    .map(toDashboardCaseSummary)
    .sort((left, right) => {
      const leftRate = left.pass_rate ?? 0;
      const rightRate = right.pass_rate ?? 0;
      if (leftRate !== rightRate) return leftRate - rightRate;
      if (left.fail_count !== right.fail_count) return right.fail_count - left.fail_count;
      return left.pass_count - right.pass_count;
    })
    .slice(0, 3);
}

export function selectSafeTop3(rows: DashboardCaseRow[]) {
  return rows
    .filter(hasEnoughSamples)
    .map(toDashboardCaseSummary)
    .filter((row) => (row.pass_rate ?? 0) >= 80)
    .sort((left, right) => {
      const leftRate = left.pass_rate ?? 0;
      const rightRate = right.pass_rate ?? 0;
      if (leftRate !== rightRate) return rightRate - leftRate;
      if (left.fail_count !== right.fail_count) return left.fail_count - right.fail_count;
      return right.pass_count - left.pass_count;
    })
    .slice(0, 3);
}

export function mapRecentViolations(rows: DashboardRecentRow[]) {
  return rows.map((row) => {
    const submitter = Array.isArray(row.submitter) ? row.submitter[0] : row.submitter;

    return {
      id: row.id,
      script_text: normalizeScriptText(row.script_text),
      created_at: row.created_at,
      risk_level: row.risk_level,
      submitter_name: submitter?.name?.trim() || "未知",
    };
  });
}
