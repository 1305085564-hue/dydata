export const BATCH5_CLEANUP_ORDER = [
  "script_usage_records",
  "video_tags",
  "video_metrics_snapshots",
  "videos",
  "daily_reports",
  "exemption_grants",
  "exemption_requests",
  "storage",
] as const;

export type Batch5CleanupResource = (typeof BATCH5_CLEANUP_ORDER)[number];

export type Batch5BatchOutcome = "all_success" | "partial_failure" | "network_failure";

export type Batch5BatchAttempt = {
  ok: boolean;
  networkError?: boolean;
};

export type Batch5DatePlan = {
  uploadDate: string;
  businessDate: string;
};

const BATCH5_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BATCH5_STORAGE_ROLES = new Set(["screenshot_1", "screenshot_2"]);

function parseBatch5Date(value: string) {
  const match = BATCH5_DATE_PATTERN.exec(value.trim());
  if (!match) throw new Error("日期格式不正确");

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error("日期格式不正确");
  }
  return date;
}

function formatBatch5Date(date: Date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function buildBatch5DatePlan(uploadDate: string): Batch5DatePlan {
  const upload = parseBatch5Date(uploadDate);
  const business = new Date(upload);
  business.setUTCDate(business.getUTCDate() - 1);
  return {
    uploadDate: formatBatch5Date(upload),
    businessDate: formatBatch5Date(business),
  };
}

export function isNextDayBatch5Upload(input: { uploadDate: string; businessDate: string }) {
  try {
    return buildBatch5DatePlan(input.uploadDate).businessDate === formatBatch5Date(parseBatch5Date(input.businessDate));
  } catch {
    return false;
  }
}

export function validateBatch5StoragePaths(
  paths: readonly string[],
  expected: { userId: string; accountId: string },
) {
  const normalized = paths.map((value) => value.trim());
  if (normalized.some((value) => !value)) throw new Error("Storage 路径不能为空");
  if (new Set(normalized).size !== normalized.length) throw new Error("Storage 路径存在重复路径");

  const prefix = `${expected.userId}/${expected.accountId}/`;
  for (const objectPath of normalized) {
    if (!objectPath.startsWith(prefix)) throw new Error("Storage 路径不属于当前夹具账号");
    const pieces = objectPath.split("/");
    const role = pieces[2];
    const fileName = pieces[3];
    if (
      pieces.length !== 4 ||
      pieces.some((piece) => !piece || piece === "." || piece === "..") ||
      !BATCH5_STORAGE_ROLES.has(role) ||
      !/\.(?:jpg|jpeg|png|webp)$/i.test(fileName)
    ) {
      throw new Error("Storage 截图槽位不正确");
    }
  }

  return [...normalized].sort();
}

export function normalizeBatch5RunId(value: string) {
  const runId = value.trim();
  if (!/^b5-[a-z0-9-]{8,80}$/i.test(runId)) {
    throw new Error("run_id 格式不正确");
  }
  return runId;
}

export function buildBatch5Marker(runId: string, label: string) {
  return `[${normalizeBatch5RunId(runId)}] ${label.trim()}`;
}

export function classifyBatch5BatchOutcome(attempts: readonly Batch5BatchAttempt[]): Batch5BatchOutcome {
  if (attempts.some((attempt) => attempt.networkError)) return "network_failure";
  if (attempts.length > 0 && attempts.every((attempt) => attempt.ok)) return "all_success";
  return "partial_failure";
}

export function isStructuredApiError(
  status: number,
  body: unknown,
  expectedStatus: number,
  expectedCode?: string,
) {
  if (status !== expectedStatus || !body || typeof body !== "object" || Array.isArray(body)) return false;
  const payload = body as { error?: unknown; code?: unknown };
  if (typeof payload.error !== "string" || !payload.error.trim()) return false;
  return expectedCode === undefined || payload.code === expectedCode;
}

export function isExpectedConflict(status: number, body: unknown) {
  return isStructuredApiError(status, body, 409);
}

export function isExpectedForbidden(status: number, body: unknown, code?: string) {
  return isStructuredApiError(status, body, 403, code);
}

export function buildBatch5FixtureLabels(runId: string) {
  const normalizedRunId = normalizeBatch5RunId(runId);
  return {
    priorDayBaseReport: buildBatch5Marker(normalizedRunId, "次日上传前一日基础数据"),
    priorDayT1Supplement: buildBatch5Marker(normalizedRunId, "前一日24小时数据补齐"),
    exemption: buildBatch5Marker(normalizedRunId, "审批夹具"),
    ocrSuccess: buildBatch5Marker(normalizedRunId, "OCR成功截图"),
    ocrFailure: buildBatch5Marker(normalizedRunId, "OCR失败截图"),
  };
}
