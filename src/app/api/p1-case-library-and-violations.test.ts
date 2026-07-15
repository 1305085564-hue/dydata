import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest, NextResponse } from "next/server";

import { buildCaseLibraryInboxResponse } from "./case-library/inbox/route";
import { buildCaseLibraryInboxCountsResponse } from "./case-library/inbox/counts/route";
import { buildCreateUsageRecordResponse } from "./conversion-hub/usage-records/route";
import { buildReviewViolationResponse } from "./violations/[id]/review/route";
import { buildCreateViolationTestRecordResponse } from "./violations/[id]/test/route";
import { buildViolationsListResponse } from "./violations/route";

type InboxBucket = {
  id: string;
  script_text: string;
  submitted_by_name: string;
  created_at: string;
  risk_level?: string | null;
  screenshot_paths?: string[] | null;
  missing_fields?: string[];
  total_views?: number;
  weighted_conversion_rate?: number;
  usage_count?: number;
  promotion_level?: string;
};

type InboxPayload = {
  pending_review: InboxBucket[];
  missing_data: InboxBucket[];
  high_risk_pending: InboxBucket[];
  promotion_candidates: InboxBucket[];
};

type PermissionMap = {
  manage_violations?: boolean;
};

type Profile = {
  businessRole: "owner" | "team_admin" | "member";
  permissions: PermissionMap;
};

type CaseRow = {
  id: string;
  submitted_by: string;
  submitted_by_name: string;
  team_id: string | null;
  status: "submitted" | "verified" | "rejected" | "archived";
  risk_level: "high" | "medium" | "low" | null;
  category?: string | null;
  purpose: "violation" | "conversion";
  is_deleted: boolean;
  usage_state?: "available" | "testing" | "banned" | "not_recommended" | null;
  promotion_level?: "promoted" | "normal" | "watching" | "deprecated" | null;
  scene_description?: string | null;
  screenshot_paths?: string[] | null;
  script_text: string;
  created_at: string;
  reviewed_at?: string | null;
  guidance_method?: "oral" | "visual" | "profile" | "comment" | "other" | null;
  pass_count?: number | null;
  fail_count?: number | null;
  total_views?: number;
  total_follows?: number;
  usage_count?: number;
  weighted_conversion_rate?: number | null;
  admin_conclusion?: string | null;
  suggested_action?: string | null;
  reviewed_by?: string | null;
};

type VisualTagLink = {
  case_id: string;
  tag_id: string;
};

type UsageRecord = {
  id: string;
  case_id: string;
  recorded_by: string;
  account_id: string | null;
  account_name_snapshot: string | null;
  team_id: string | null;
  used_at: string;
  views: number;
  follows: number;
  source: string;
  daily_report_id: string | null;
  note: string | null;
  result_flag: "pass" | "fail" | null;
};

function createJsonResponse(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function createRequest(url: string, body?: unknown) {
  return new NextRequest(url, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildInboxPayload(rows: CaseRow[], visibleUserIds: string[]): InboxPayload {
  const visible = rows.filter((row) => visibleUserIds.includes(row.submitted_by) && !row.is_deleted);

  return {
    pending_review: visible
      .filter((row) => row.status === "submitted")
      .map((row) => ({
        id: row.id,
        script_text: row.script_text,
        submitted_by_name: row.submitted_by_name,
        created_at: row.created_at,
        risk_level: row.risk_level,
        screenshot_paths: row.screenshot_paths ?? [],
      })),
    missing_data: visible
      .filter((row) => row.status === "submitted")
      .filter((row) => {
        const screenshotsMissing = !row.screenshot_paths || row.screenshot_paths.length === 0;
        const sceneMissing = !row.scene_description || row.scene_description.trim() === "";
        return screenshotsMissing || sceneMissing;
      })
      .map((row) => ({
        id: row.id,
        script_text: row.script_text,
        submitted_by_name: row.submitted_by_name,
        created_at: row.created_at,
        risk_level: row.risk_level,
        screenshot_paths: row.screenshot_paths ?? [],
        missing_fields: [
          ...((!row.screenshot_paths || row.screenshot_paths.length === 0) ? ["screenshot"] : []),
          ...((!row.scene_description || row.scene_description.trim() === "") ? ["scene_description"] : []),
        ],
      })),
    high_risk_pending: visible
      .filter((row) => row.status === "submitted" && row.risk_level === "high")
      .map((row) => ({
        id: row.id,
        script_text: row.script_text,
        submitted_by_name: row.submitted_by_name,
        created_at: row.created_at,
        risk_level: row.risk_level,
        screenshot_paths: row.screenshot_paths ?? [],
      })),
    promotion_candidates: visible
      .filter((row) => (row.usage_count ?? 0) >= 5)
      .filter((row) => (row.weighted_conversion_rate ?? 0) >= 0.05)
      .filter((row) => row.promotion_level === "normal")
      .map((row) => ({
        id: row.id,
        script_text: row.script_text,
        submitted_by_name: row.submitted_by_name,
        created_at: row.created_at,
        total_views: row.total_views ?? 0,
        weighted_conversion_rate: row.weighted_conversion_rate ?? 0,
        usage_count: row.usage_count ?? 0,
        promotion_level: row.promotion_level ?? "normal",
        screenshot_paths: row.screenshot_paths ?? [],
      })),
  };
}

function buildInboxCounts(payload: InboxPayload) {
  return {
    pending_review: payload.pending_review.length,
    missing_data: payload.missing_data.length,
    high_risk_pending: payload.high_risk_pending.length,
    promotion_candidates: payload.promotion_candidates.length,
  };
}

function compareOrderValues(
  left: string | number | boolean | null | undefined,
  right: string | number | boolean | null | undefined,
  ascending: boolean,
  nullsFirst?: boolean,
) {
  if (left == null && right == null) return 0;
  if (left == null) return nullsFirst ? -1 : 1;
  if (right == null) return nullsFirst ? 1 : -1;
  if (left < right) return ascending ? -1 : 1;
  if (left > right) return ascending ? 1 : -1;
  return 0;
}

type ViolationsListTracker = {
  selectQueries: string[];
  rangeCalls: Array<{ from: number; to: number }>;
};

function createViolationsListSupabase(
  rows: CaseRow[],
  tagLinks: VisualTagLink[] = [],
  tracker?: ViolationsListTracker,
) {
  let filtered = rows.slice();
  const orderings: Array<{
    column: string;
    ascending: boolean;
    nullsFirst?: boolean;
  }> = [];

  return {
    from(table: string) {
      if (table === "violation_case_visual_tags") {
        return {
          select() {
            return {
              async in(column: string, values: string[]) {
                assert.equal(column, "tag_id");
                return {
                  data: tagLinks
                    .filter((row) => values.includes(row.tag_id))
                    .map((row) => ({ case_id: row.case_id })),
                  error: null,
                };
              },
            };
          },
        };
      }

      if (table === "videos") {
        type VideoListRow = {
          id: string;
          content: string;
          anomaly_status: string;
          punish_type: string | null;
          uploaded_at: string;
          created_at: string;
        };
        let videoFiltered: VideoListRow[] = rows.map((row) => ({
          id: row.id,
          content: row.script_text,
          anomaly_status: "abnormal",
          punish_type: row.category ?? null,
          uploaded_at: row.created_at,
          created_at: row.created_at,
        }));
        const videoOrderings: Array<{
          column: string;
          ascending: boolean;
          nullsFirst?: boolean;
        }> = [];

        const videoBuilder = {
          select(query?: string) {
            tracker?.selectQueries.push(query ?? "");
            return videoBuilder;
          },
          eq(column: string, value: unknown) {
            videoFiltered = videoFiltered.filter((row) => row[column as keyof VideoListRow] === value);
            return videoBuilder;
          },
          in(column: string, values: string[]) {
            videoFiltered = videoFiltered.filter((row) => values.includes(String(row[column as keyof VideoListRow] ?? "")));
            return videoBuilder;
          },
          ilike(column: string, pattern: string) {
            const needle = pattern.replaceAll("%", "").toLowerCase();
            videoFiltered = videoFiltered.filter((row) => String(row[column as keyof VideoListRow] ?? "").toLowerCase().includes(needle));
            return videoBuilder;
          },
          order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
            videoOrderings.push({ column, ...options });
            return videoBuilder;
          },
          async range(from: number, to: number) {
            tracker?.rangeCalls.push({ from, to });
            const ordered = videoFiltered.slice();

            for (const ordering of [...videoOrderings].reverse()) {
              ordered.sort((left, right) =>
                compareOrderValues(
                  left[ordering.column as keyof VideoListRow],
                  right[ordering.column as keyof VideoListRow],
                  ordering.ascending,
                  ordering.nullsFirst,
                ));
            }

            return {
              data: ordered.slice(from, to + 1),
              error: null,
              count: ordered.length,
            };
          },
        };

        return videoBuilder;
      }

      assert.equal(table, "violation_cases");

      const builder = {
        select(query?: string) {
          tracker?.selectQueries.push(query ?? "");
          return builder;
        },
        eq(column: string, value: unknown) {
          filtered = filtered.filter((row) => {
            const cell = row[column as keyof CaseRow];
            return cell === value;
          });
          return builder;
        },
        in(column: string, values: string[]) {
          filtered = filtered.filter((row) => values.includes(String(row[column as keyof CaseRow] ?? "")));
          return builder;
        },
        ilike(column: string, pattern: string) {
          const needle = pattern.replaceAll("%", "").toLowerCase();
          filtered = filtered.filter((row) => String(row[column as keyof CaseRow] ?? "").toLowerCase().includes(needle));
          return builder;
        },
        order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
          orderings.push({ column, ...options });
          return builder;
        },
        async range(from: number, to: number) {
          tracker?.rangeCalls.push({ from, to });
          const ordered = filtered.slice();

          for (const ordering of [...orderings].reverse()) {
            ordered.sort((left, right) =>
              compareOrderValues(
                left[ordering.column as keyof CaseRow] as string | number | boolean | null | undefined,
                right[ordering.column as keyof CaseRow] as string | number | boolean | null | undefined,
                ordering.ascending,
                ordering.nullsFirst,
              ));
          }

          return {
            data: ordered.slice(from, to + 1),
            error: null,
            count: ordered.length,
          };
        },
        then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
          const ordered = filtered.slice();

          for (const ordering of [...orderings].reverse()) {
            ordered.sort((left, right) =>
              compareOrderValues(
                left[ordering.column as keyof CaseRow] as string | number | boolean | null | undefined,
                right[ordering.column as keyof CaseRow] as string | number | boolean | null | undefined,
                ordering.ascending,
                ordering.nullsFirst,
              ));
          }

          return Promise.resolve({
            data: ordered,
            error: null,
            count: ordered.length,
          }).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

function createReviewSupabase(rows: CaseRow[]) {
  let pendingId: string | null = null;
  let pendingDeleted = false;
  let pendingPurpose: string | null = null;

  return {
    rows,
    from(table: string) {
      assert.equal(table, "violation_cases");

      const findTarget = () =>
        rows.find((row) =>
          row.id === pendingId
          && row.is_deleted === pendingDeleted
          && (pendingPurpose ? row.purpose === pendingPurpose : true),
        );

      return {
        select(query?: string) {
          if (query) {
            assert.match(query, /status/);
          }
          return {
            eq(column: string, value: unknown) {
              if (column === "id") pendingId = String(value);
              if (column === "is_deleted") pendingDeleted = Boolean(value);
              if (column === "purpose") pendingPurpose = String(value);
              return this;
            },
            async single() {
              const target = findTarget();
              if (!target) {
                return { data: null, error: { message: "not found" } };
              }
              return {
                data: {
                  id: target.id,
                  status: target.status,
                  usage_state: target.usage_state ?? null,
                  risk_level: target.risk_level ?? null,
                  admin_conclusion: target.admin_conclusion ?? null,
                  suggested_action: target.suggested_action ?? null,
                },
                error: null,
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              if (column === "id") pendingId = String(value);
              if (column === "is_deleted") pendingDeleted = Boolean(value);
              if (column === "purpose") pendingPurpose = String(value);
              return this;
            },
            select() {
              return {
                async single() {
                  const target = findTarget();
                  if (!target) {
                    return { data: null, error: { message: "not found" } };
                  }

                  Object.assign(target, payload);
                  return { data: target, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createCaseLookupSupabase(rows: CaseRow[]) {
  let pendingId: string | null = null;
  let pendingDeleted = false;
  let pendingPurpose: string | null = null;

  return {
    rows,
    from(table: string) {
      assert.equal(table, "violation_cases");

      return {
        select() {
          return this;
        },
        eq(column: string, value: unknown) {
          if (column === "id") pendingId = String(value);
          if (column === "is_deleted") pendingDeleted = Boolean(value);
          if (column === "purpose") pendingPurpose = String(value);
          return this;
        },
        async single() {
          const row = rows.find((item) =>
            item.id === pendingId
            && item.is_deleted === pendingDeleted
            && item.purpose === pendingPurpose,
          );
          if (!row) {
            return { data: null, error: { message: "not found" } };
          }
          return { data: row, error: null };
        },
      };
    },
  };
}

function createUsageRecordWriter(store: {
  cases: CaseRow[];
  records: UsageRecord[];
}) {
  return async (
    _supabase: unknown,
    userId: string,
    payload: {
      case_id: string | null;
      account_id: string | null;
      used_at: string;
      views: number;
      follows: number;
      source: string;
      daily_report_id: string | null;
      note: string | null;
      result_flag?: "pass" | "fail" | null;
    },
  ) => {
    if (!payload.case_id) {
      return { ok: false as const, status: 422, code: "VALIDATION_ERROR" as const, message: "case_id 不能为空" };
    }

    const targetCase = store.cases.find((row) => row.id === payload.case_id);
    if (!targetCase) {
      return { ok: false as const, status: 404, code: "NOT_FOUND" as const, message: "话术案例不存在" };
    }

    const record: UsageRecord = {
      id: `record-${store.records.length + 1}`,
      case_id: payload.case_id,
      recorded_by: userId,
      account_id: payload.account_id,
      account_name_snapshot: null,
      team_id: targetCase.team_id,
      used_at: payload.used_at,
      views: payload.views,
      follows: payload.follows,
      source: payload.source,
      daily_report_id: payload.daily_report_id,
      note: payload.note,
      result_flag: payload.result_flag ?? null,
    };

    store.records.push(record);

    const related = store.records.filter((item) => item.case_id === payload.case_id);
    targetCase.total_views = related.reduce((sum, item) => sum + item.views, 0);
    targetCase.total_follows = related.reduce((sum, item) => sum + item.follows, 0);
    targetCase.usage_count = related.length;
    targetCase.weighted_conversion_rate = targetCase.total_views === 0
      ? 0
      : targetCase.total_follows / targetCase.total_views;

    return { ok: true as const, data: record };
  };
}

test("case-library inbox 鉴权失败时返回 401", async () => {
  const response = await buildCaseLibraryInboxResponse({
    requireCaseLibraryServiceClient: async () => ({
      response: createJsonResponse(401, { error: "未登录" }),
    }),
    unwrapCaseLibraryRpc: (result) => ({ data: result.data ?? null }),
  });

  assert.equal(response.status, 401);
});

test("case-library inbox 鉴权失败时返回 403", async () => {
  const response = await buildCaseLibraryInboxResponse({
    requireCaseLibraryServiceClient: async () => ({
      response: createJsonResponse(403, { error: "无权限" }),
    }),
    unwrapCaseLibraryRpc: (result) => ({ data: result.data ?? null }),
  });

  assert.equal(response.status, 403);
});

test("case-library inbox owner 能拿到四类数据，counts 与列表一致", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-1",
      submitted_by: "owner-1",
      submitted_by_name: "阿禅",
      team_id: "team-a",
      status: "submitted",
      risk_level: "high",
      purpose: "violation",
      is_deleted: false,
      scene_description: "画面描述",
      screenshot_paths: ["owner-1/1.png"],
      script_text: "待审核高风险",
      created_at: "2026-05-21T09:00:00.000Z",
      usage_count: 0,
      promotion_level: "normal",
    },
    {
      id: "case-2",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "submitted",
      risk_level: "medium",
      purpose: "violation",
      is_deleted: false,
      scene_description: null,
      screenshot_paths: ["member-1/1.png"],
      script_text: "缺少场景",
      created_at: "2026-05-21T08:00:00.000Z",
      usage_count: 0,
      promotion_level: "normal",
    },
    {
      id: "case-3",
      submitted_by: "member-2",
      submitted_by_name: "李四",
      team_id: "team-b",
      status: "verified",
      risk_level: "low",
      purpose: "violation",
      is_deleted: false,
      usage_state: "available",
      promotion_level: "normal",
      scene_description: "正常",
      screenshot_paths: ["member-2/1.png"],
      script_text: "推广候选",
      created_at: "2026-05-21T07:00:00.000Z",
      usage_count: 6,
      total_views: 200,
      weighted_conversion_rate: 0.06,
    },
  ];

  const payload = buildInboxPayload(rows, ["owner-1", "member-1", "member-2"]);
  const counts = buildInboxCounts(payload);
  const inboxRpc = async (_name: string, _params: { p_user_id: string }) => ({
    data: payload,
    error: null,
  });
  const countsRpc = async (_name: string, _params: { p_user_id: string }) => ({
    data: counts,
    error: null,
  });

  const inboxResponse = await buildCaseLibraryInboxResponse({
    requireCaseLibraryServiceClient: async () => ({
      actor: { userId: "owner-1" },
      supabase: { rpc: inboxRpc },
    }),
    unwrapCaseLibraryRpc: (result) => ({ data: result.data as InboxPayload }),
  });
  const countsResponse = await buildCaseLibraryInboxCountsResponse({
    requireCaseLibraryServiceClient: async () => ({
      actor: { userId: "owner-1" },
      supabase: { rpc: countsRpc },
    }),
    unwrapCaseLibraryRpc: (result) => ({ data: result.data as ReturnType<typeof buildInboxCounts> }),
  });

  const inboxJson = await inboxResponse.json();
  const countsJson = await countsResponse.json();

  assert.equal(inboxJson.pending_review.length, 2);
  assert.deepEqual(inboxJson.pending_review[0].screenshot_paths, ["owner-1/1.png"]);
  assert.equal(inboxJson.missing_data.length, 1);
  assert.equal(inboxJson.high_risk_pending.length, 1);
  assert.equal(inboxJson.promotion_candidates.length, 1);
  assert.deepEqual(countsJson, counts);
});

test("case-library inbox team_admin 只看到自己 team_id 下的数据，missing_data 边界只命中截图或场景缺失", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-a",
      submitted_by: "member-a1",
      submitted_by_name: "组员 A",
      team_id: "team-a",
      status: "submitted",
      risk_level: "medium",
      purpose: "violation",
      is_deleted: false,
      scene_description: "有描述",
      screenshot_paths: null,
      script_text: "缺截图",
      created_at: "2026-05-21T09:00:00.000Z",
    },
    {
      id: "case-b",
      submitted_by: "member-a2",
      submitted_by_name: "组员 B",
      team_id: "team-a",
      status: "submitted",
      risk_level: "low",
      purpose: "violation",
      is_deleted: false,
      scene_description: null,
      screenshot_paths: ["member-a2/1.png"],
      script_text: "缺场景",
      created_at: "2026-05-21T08:00:00.000Z",
    },
    {
      id: "case-c",
      submitted_by: "member-a3",
      submitted_by_name: "组员 C",
      team_id: "team-a",
      status: "submitted",
      risk_level: "low",
      purpose: "violation",
      is_deleted: false,
      scene_description: "完整",
      screenshot_paths: ["member-a3/1.png"],
      script_text: "完整数据",
      created_at: "2026-05-21T07:00:00.000Z",
    },
    {
      id: "case-d",
      submitted_by: "member-b1",
      submitted_by_name: "外团队成员",
      team_id: "team-b",
      status: "submitted",
      risk_level: "high",
      purpose: "violation",
      is_deleted: false,
      scene_description: null,
      screenshot_paths: null,
      script_text: "别人的队列",
      created_at: "2026-05-21T06:00:00.000Z",
    },
  ];

  const payload = buildInboxPayload(rows, ["member-a1", "member-a2", "member-a3"]);
  const response = await buildCaseLibraryInboxResponse({
    requireCaseLibraryServiceClient: async () => ({
      actor: { userId: "admin-a" },
      supabase: {
        rpc: async () => ({ data: payload, error: null }),
      },
    }),
    unwrapCaseLibraryRpc: (result) => ({ data: result.data as InboxPayload }),
  });

  const json = await response.json();
  assert.deepEqual(
    json.pending_review.map((item: InboxBucket) => item.id),
    ["case-a", "case-b", "case-c"],
  );
  assert.deepEqual(
    json.missing_data.map((item: InboxBucket) => item.id),
    ["case-a", "case-b"],
  );
});

test("violations review 会写入四个维度字段", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-1",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "submitted",
      risk_level: "medium",
      purpose: "violation",
      is_deleted: false,
      usage_state: "testing",
      promotion_level: "normal",
      script_text: "测试话术",
      created_at: "2026-05-21T09:00:00.000Z",
    },
  ];
  const supabase = createReviewSupabase(rows);

  const response = await buildReviewViolationResponse(
    createRequest("https://dydata.cc/api/violations/case-1/review", {
      status: "verified",
      risk_level: "high",
      usage_state: "available",
      promotion_level: "watching",
      admin_conclusion: "通过",
      suggested_action: "继续跑量",
    }),
    { params: Promise.resolve({ id: "case-1" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase,
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(rows[0].status, "verified");
  assert.equal(rows[0].risk_level, "high");
  assert.equal(rows[0].usage_state, "available");
  assert.equal(rows[0].promotion_level, "watching");
});

test("violations review 仅传 usage_state 时保留其他原值", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-2",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "verified",
      risk_level: "high",
      purpose: "violation",
      is_deleted: false,
      usage_state: "testing",
      promotion_level: "promoted",
      script_text: "测试话术",
      created_at: "2026-05-21T09:00:00.000Z",
      admin_conclusion: "原结论",
      suggested_action: "原建议",
    },
  ];
  const supabase = createReviewSupabase(rows);

  const response = await buildReviewViolationResponse(
    createRequest("https://dydata.cc/api/violations/case-2/review", {
      status: "verified",
      risk_level: "high",
      usage_state: "banned",
      admin_conclusion: "原结论",
      suggested_action: "原建议",
    }),
    { params: Promise.resolve({ id: "case-2" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase,
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(rows[0].status, "verified");
  assert.equal(rows[0].risk_level, "high");
  assert.equal(rows[0].usage_state, "banned");
  assert.equal(rows[0].promotion_level, "promoted");
});

test("violations review 非法枚举返回 400，普通 member 返回 403", async () => {
  const invalidResponse = await buildReviewViolationResponse(
    createRequest("https://dydata.cc/api/violations/case-3/review", {
      status: "verified",
      risk_level: "critical",
    }),
    { params: Promise.resolve({ id: "case-3" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: createReviewSupabase([]),
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
    },
  );
  assert.equal(invalidResponse.status, 400);

  const forbiddenResponse = await buildReviewViolationResponse(
    createRequest("https://dydata.cc/api/violations/case-3/review", {
      status: "verified",
      risk_level: "low",
    }),
    { params: Promise.resolve({ id: "case-3" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: createReviewSupabase([]),
        user: { id: "member-1" },
      }),
      requireViolationAdmin: async () => ({
        ok: false,
        response: createJsonResponse(403, {
          error: { code: "FORBIDDEN", message: "缺少违规话术复核权限" },
        }),
      }),
    },
  );
  assert.equal(forbiddenResponse.status, 403);
});

test("violations review 支持 conversion 类型审批", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-conversion-1",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "submitted",
      risk_level: "medium",
      purpose: "conversion",
      is_deleted: false,
      usage_state: "testing",
      promotion_level: "normal",
      script_text: "转化话术",
      created_at: "2026-05-21T09:00:00.000Z",
    },
  ];
  const supabase = createReviewSupabase(rows);

  const response = await buildReviewViolationResponse(
    createRequest("https://dydata.cc/api/violations/case-conversion-1/review", {
      status: "verified",
      risk_level: "low",
      usage_state: "available",
      admin_conclusion: "转化案例通过",
      suggested_action: "继续测试",
    }),
    { params: Promise.resolve({ id: "case-conversion-1" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase,
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(rows[0].status, "verified");
  assert.equal(rows[0].usage_state, "available");
});

test("violations list staff/admin/default view 分流正确", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-1",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "verified",
      risk_level: "high",
      purpose: "violation",
      is_deleted: false,
      usage_state: "available",
      script_text: "可用",
      created_at: "2026-05-21T09:00:00.000Z",
    },
    {
      id: "case-2",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "verified",
      risk_level: "medium",
      purpose: "violation",
      is_deleted: false,
      usage_state: "banned",
      script_text: "禁用",
      created_at: "2026-05-21T08:00:00.000Z",
    },
    {
      id: "case-3",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "submitted",
      risk_level: "medium",
      purpose: "violation",
      is_deleted: false,
      usage_state: "testing",
      script_text: "待审核",
      created_at: "2026-05-21T07:00:00.000Z",
    },
  ];

  const staffResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?view=staff"),
    {
      getAuthenticatedContext: async () => ({
        supabase: createViolationsListSupabase(rows),
        user: { id: "member-1" },
      }),
      getUserProfile: async () => ({
        businessRole: "member",
        permissions: {},
      }),
    },
  );
  const staffJson = await staffResponse.json();
  assert.equal(staffJson.view, "staff");
  assert.deepEqual(staffJson.data.map((item: CaseRow) => item.id), ["case-1", "case-2", "case-3"]);

  const adminResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?view=admin"),
    {
      getAuthenticatedContext: async () => ({
        supabase: createViolationsListSupabase(rows),
        user: { id: "owner-1" },
      }),
      getUserProfile: async () => ({
        businessRole: "owner",
        permissions: {},
      }),
    },
  );
  const adminJson = await adminResponse.json();
  assert.equal(adminJson.view, "admin");
  assert.deepEqual(adminJson.data.map((item: CaseRow) => item.id), ["case-1", "case-2", "case-3"]);

  const inferredResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations"),
    {
      getAuthenticatedContext: async () => ({
        supabase: createViolationsListSupabase(rows),
        user: { id: "owner-1" },
      }),
      getUserProfile: async (): Promise<Profile> => ({
        businessRole: "team_admin",
        permissions: { manage_violations: true },
      }),
    },
  );
  const inferredJson = await inferredResponse.json();
  assert.equal(inferredJson.view, "admin");
});

test("violations list 支持排序和多种筛选参数", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-a",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "verified",
      risk_level: "low",
      purpose: "violation",
      is_deleted: false,
      usage_state: "available",
      script_text: "A",
      created_at: "2026-05-21T09:00:00.000Z",
      guidance_method: "oral",
      pass_count: 9,
      fail_count: 1,
      usage_count: 5,
      weighted_conversion_rate: 0.11,
    },
    {
      id: "case-b",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "verified",
      risk_level: "medium",
      purpose: "violation",
      is_deleted: false,
      usage_state: "available",
      script_text: "B",
      created_at: "2026-05-21T10:00:00.000Z",
      guidance_method: "visual",
      pass_count: 1,
      fail_count: 4,
      usage_count: 9,
      weighted_conversion_rate: 0.31,
    },
    {
      id: "case-c",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "verified",
      risk_level: "high",
      purpose: "violation",
      is_deleted: false,
      usage_state: "available",
      script_text: "C",
      created_at: "2026-05-21T11:00:00.000Z",
      guidance_method: "oral",
      pass_count: 3,
      fail_count: 3,
      usage_count: 3,
      weighted_conversion_rate: 0.21,
    },
  ];
  const tagLinks: VisualTagLink[] = [
    { case_id: "case-b", tag_id: "tag-1" },
    { case_id: "case-c", tag_id: "tag-2" },
  ];
  const tracker: ViolationsListTracker = {
    selectQueries: [],
    rangeCalls: [],
  };

  const deps = {
    getAuthenticatedContext: async () => ({
      supabase: createViolationsListSupabase(rows, tagLinks, tracker),
      user: { id: "owner-1" },
    }),
    getUserProfile: async (): Promise<Profile> => ({
      businessRole: "owner",
      permissions: {},
    }),
  };

  const createdAtSortResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?sort=created_at&order=asc"),
    deps,
  );
  const createdAtSortJson = await createdAtSortResponse.json();
  assert.equal(createdAtSortJson.sort, "created_at");
  assert.equal(createdAtSortJson.order, "asc");
  assert.deepEqual(createdAtSortJson.data.map((item: CaseRow) => item.id), ["case-a", "case-b", "case-c"]);

  const searchResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?q=B"),
    deps,
  );
  const searchJson = await searchResponse.json();
  assert.deepEqual(searchJson.data.map((item: CaseRow) => item.id), ["case-b"]);
  assert.equal(tracker.selectQueries.some((query) => query.includes("*")), false);
  assert.equal(tracker.rangeCalls.some((call) => call.from === 0 && call.to === 9999), false);

  const categoryResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?category=短视频"),
    deps,
  );
  const categoryJson = await categoryResponse.json();
  assert.deepEqual(categoryJson.data.map((item: CaseRow) => item.id), []);

  const visualTagsResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?visual_tag_ids=tag-2"),
    deps,
  );
  const visualTagsJson = await visualTagsResponse.json();
  assert.deepEqual(visualTagsJson.data.map((item: CaseRow) => item.id), []);
});

test("violations list 支持话术库 pending/processed 状态分栏筛选", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-pending",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "submitted",
      risk_level: "medium",
      purpose: "violation",
      is_deleted: false,
      script_text: "待处理话术",
      screenshot_paths: ["member-1/pending.png"],
      created_at: "2026-05-21T09:00:00.000Z",
    },
    {
      id: "case-verified",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "verified",
      risk_level: "low",
      purpose: "violation",
      is_deleted: false,
      script_text: "已通过话术",
      screenshot_paths: ["member-1/verified.png"],
      created_at: "2026-05-21T08:00:00.000Z",
    },
    {
      id: "case-rejected",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "rejected",
      risk_level: "high",
      purpose: "violation",
      is_deleted: false,
      script_text: "已驳回话术",
      screenshot_paths: ["member-1/rejected.png"],
      created_at: "2026-05-21T07:00:00.000Z",
    },
    {
      id: "case-archived",
      submitted_by: "member-1",
      submitted_by_name: "张三",
      team_id: "team-a",
      status: "archived",
      risk_level: "low",
      purpose: "violation",
      is_deleted: false,
      script_text: "已归档话术",
      screenshot_paths: ["member-1/archived.png"],
      created_at: "2026-05-21T06:00:00.000Z",
    },
  ];

  const deps = {
    getAuthenticatedContext: async () => ({
      supabase: createViolationsListSupabase(rows),
      user: { id: "owner-1" },
    }),
    getUserProfile: async (): Promise<Profile> => ({
      businessRole: "owner",
      permissions: {},
    }),
  };

  const pendingResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?status=pending"),
    deps,
  );
  const pendingJson = await pendingResponse.json();
  assert.deepEqual(pendingJson.data.map((item: CaseRow) => item.id), ["case-pending", "case-verified", "case-rejected", "case-archived"]);

  const processedResponse = await buildViolationsListResponse(
    createRequest("https://dydata.cc/api/violations?status=processed&sort=created_at&order=desc"),
    deps,
  );
  const processedJson = await processedResponse.json();
  assert.deepEqual(
    processedJson.data.map((item: CaseRow) => item.id),
    ["case-pending", "case-verified", "case-rejected", "case-archived"],
  );
});

test("conversion-hub usage-records 支持 pass/fail/null 三态，并继续汇总到案例", async () => {
  const caseId = "123e4567-e89b-42d3-a456-426614174000";
  const store: { cases: CaseRow[]; records: UsageRecord[] } = {
    cases: [
      {
        id: caseId,
        submitted_by: "member-1",
        submitted_by_name: "张三",
        team_id: "team-a",
        status: "verified",
        risk_level: "low",
        purpose: "conversion" as const,
        is_deleted: false,
        usage_state: "available",
        script_text: "转化话术",
        created_at: "2026-05-21T09:00:00.000Z",
        total_views: 0,
        total_follows: 0,
        usage_count: 0,
        weighted_conversion_rate: 0,
      },
    ],
    records: [] as UsageRecord[],
  };
  const writer = createUsageRecordWriter(store);

  const passResponse = await buildCreateUsageRecordResponse(
    createRequest("https://dydata.cc/api/conversion-hub/usage-records", {
      case_id: caseId,
      used_at: "2026-05-21",
      views: 10,
      follows: 2,
      result_flag: "pass",
    }),
    {
      getAuthenticatedContext: async () => ({ user: { id: "member-1" } }),
      createAdminClient: () => ({}),
      createUsageRecordForUser: writer,
      canSeeAllUsageRecords: async () => false,
    },
  );
  const failResponse = await buildCreateUsageRecordResponse(
    createRequest("https://dydata.cc/api/conversion-hub/usage-records", {
      case_id: caseId,
      used_at: "2026-05-21",
      views: 5,
      follows: 1,
      result_flag: "fail",
    }),
    {
      getAuthenticatedContext: async () => ({ user: { id: "member-1" } }),
      createAdminClient: () => ({}),
      createUsageRecordForUser: writer,
      canSeeAllUsageRecords: async () => false,
    },
  );
  const nullResponse = await buildCreateUsageRecordResponse(
    createRequest("https://dydata.cc/api/conversion-hub/usage-records", {
      case_id: caseId,
      used_at: "2026-05-21",
      views: 7,
      follows: 0,
    }),
    {
      getAuthenticatedContext: async () => ({ user: { id: "member-1" } }),
      createAdminClient: () => ({}),
      createUsageRecordForUser: writer,
      canSeeAllUsageRecords: async () => false,
    },
  );

  assert.equal(passResponse.status, 201);
  assert.equal(failResponse.status, 201);
  assert.equal(nullResponse.status, 201);
  assert.deepEqual(
    store.records.map((item) => item.result_flag),
    ["pass", "fail", null],
  );
  assert.equal(store.cases[0].total_views, 22);
  assert.equal(store.cases[0].total_follows, 3);
  assert.equal(store.cases[0].usage_count, 3);
});

test("violations test 过渡接口保留 X-Deprecation header，并写入 script_usage_records", async () => {
  const store: { cases: CaseRow[]; records: UsageRecord[] } = {
    cases: [
      {
        id: "case-9",
        submitted_by: "member-1",
        submitted_by_name: "张三",
        team_id: "team-a",
        status: "verified",
        risk_level: "low",
        purpose: "violation" as const,
        is_deleted: false,
        usage_state: "testing",
        script_text: "测试接口",
        created_at: "2026-05-21T09:00:00.000Z",
      },
    ],
    records: [] as UsageRecord[],
  };

  const response = await buildCreateViolationTestRecordResponse(
    createRequest("https://dydata.cc/api/violations/case-9/test", {
      passed: true,
      note: "首测通过",
    }),
    { params: Promise.resolve({ id: "case-9" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: createCaseLookupSupabase(store.cases),
        user: { id: "member-1" },
      }),
      createUsageRecordForUser: createUsageRecordWriter(store),
    },
  );

  const json = await response.json();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("X-Deprecation"), "use POST /api/conversion-hub/usage-records with result_flag");
  assert.equal(json.migrated, true);
  assert.equal(store.records.length, 1);
  assert.equal(store.records[0].result_flag, "pass");
});
