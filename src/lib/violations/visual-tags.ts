import { isPlainObject, normalizeOptionalText } from "./api";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisualTagRow = {
  id: string;
  name: string;
  description: string | null;
};

export type VisualTagCaseLinkRow = {
  tag_id: string;
};

export type VisualTagCaseRow = {
  id: string;
  script_text: string | null;
  account_name_snapshot: string | null;
  pass_count: number | null;
  fail_count: number | null;
  status: string;
};

export type CreateVisualTagPayload =
  | { ok: true; data: { name: string; description: string | null } }
  | { ok: false; message: string };

export type SetCaseVisualTagsPayload =
  | { ok: true; data: { tag_ids: string[] } }
  | { ok: false; message: string };

export function validateCreateVisualTagPayload(body: unknown): CreateVisualTagPayload {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return { ok: false, message: "name 为必填项" };
  }

  if (name.length > 50) {
    return { ok: false, message: "name 不能超过 50 字" };
  }

  return {
    ok: true,
    data: {
      name,
      description: normalizeOptionalText(body.description, 500),
    },
  };
}

export function validateCaseVisualTagIds(body: unknown): SetCaseVisualTagsPayload {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  if (!Array.isArray(body.tag_ids)) {
    return { ok: false, message: "tag_ids 不合法" };
  }

  const normalized: string[] = [];
  for (const value of body.tag_ids) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
      return { ok: false, message: "tag_ids 包含非法 UUID" };
    }
    normalized.push(value.trim());
  }

  return {
    ok: true,
    data: {
      tag_ids: Array.from(new Set(normalized)).slice(0, 50),
    },
  };
}

export function calculateVisualTagPassRate(passCount: number, failCount: number) {
  const total = passCount + failCount;
  if (total <= 0) return null;
  return Math.round((passCount * 100) / total);
}

export function buildVisualTagList(tags: VisualTagRow[], links: VisualTagCaseLinkRow[]) {
  const countMap = new Map<string, number>();
  for (const link of links) {
    countMap.set(link.tag_id, (countMap.get(link.tag_id) ?? 0) + 1);
  }

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    description: tag.description,
    case_count: countMap.get(tag.id) ?? 0,
  }));
}

export function buildVisualTagDetail(tag: VisualTagRow, cases: VisualTagCaseRow[]) {
  const totalCases = cases.length;
  const passCount = cases.reduce((sum, row) => sum + (row.pass_count ?? 0), 0);
  const failCount = cases.reduce((sum, row) => sum + (row.fail_count ?? 0), 0);

  return {
    tag,
    stats: {
      totalCases,
      passCount,
      failCount,
      passRate: calculateVisualTagPassRate(passCount, failCount),
    },
    cases: cases.map((row) => ({
      id: row.id,
      script_text: row.script_text ?? "",
      account_name_snapshot: row.account_name_snapshot,
      pass_count: row.pass_count ?? 0,
      fail_count: row.fail_count ?? 0,
      status: row.status,
    })),
  };
}
