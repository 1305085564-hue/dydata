import assert from "node:assert/strict";
import test from "node:test";

import {
  averageMetricRows,
  getLegacyComparisonData,
  getReferenceMetrics,
  getShanghaiTodayStartIso,
} from "./content-comparison-reference";

type QueryState = {
  table: string;
  selected?: string;
  filters: Array<{ type: string; column: string; value: unknown }>;
  orderBy?: { column: string; ascending: boolean };
  limitValue?: number;
};

type ResponseMap = Record<string, unknown>;

type LoggedQuery = {
  table: string;
  selected?: string;
  filters: Array<{ type: string; column: string; value: unknown }>;
  orderBy?: { column: string; ascending: boolean };
  limitValue?: number;
};

function makeMetricRow(overrides: Partial<Record<string, number | null | string>> = {}) {
  return {
    video_id: "video-default",
    play_count: 1000,
    bounce_rate_2s: 20,
    completion_rate_5s: 40,
    completion_rate: 30,
    avg_play_duration: 12,
    avg_play_ratio: 0.5,
    follower_gain: 10,
    likes: 100,
    comments: 20,
    shares: 5,
    favorites: 12,
    ...overrides,
  };
}

function createSupabaseStub(responses: ResponseMap) {
  const queries: LoggedQuery[] = [];

  const buildQuery = (table: string) => {
    const state: QueryState = { table, filters: [] };

    const execute = async (mode: "many" | "maybeSingle") => {
      const key = serializeQuery({ ...state, mode });
      queries.push({
        table: state.table,
        selected: state.selected,
        filters: [...state.filters],
        orderBy: state.orderBy,
        limitValue: state.limitValue,
      });
      if (!(key in responses)) {
        throw new Error(`Missing stub for query: ${key}`);
      }
      const value = responses[key];
      return mode === "maybeSingle" ? { data: value ?? null } : { data: value ?? null };
    };

    const query = {
      select(selected: string) {
        state.selected = selected;
        return query;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ type: "eq", column, value });
        return query;
      },
      neq(column: string, value: unknown) {
        state.filters.push({ type: "neq", column, value });
        return query;
      },
      lt(column: string, value: unknown) {
        state.filters.push({ type: "lt", column, value });
        return query;
      },
      gte(column: string, value: unknown) {
        state.filters.push({ type: "gte", column, value });
        return query;
      },
      in(column: string, value: unknown[]) {
        state.filters.push({ type: "in", column, value });
        return query;
      },
      order(column: string, options?: { ascending?: boolean }) {
        state.orderBy = { column, ascending: options?.ascending ?? true };
        return query;
      },
      limit(value: number) {
        state.limitValue = value;
        return query;
      },
      maybeSingle() {
        return execute("maybeSingle");
      },
      then(resolve: (value: { data: unknown }) => unknown, reject?: (reason: unknown) => unknown) {
        return execute("many").then(resolve, reject);
      },
    };

    return query;
  };

  return {
    queries,
    client: {
      from(table: string) {
        return buildQuery(table);
      },
    },
  };
}

function serializeQuery({
  table,
  selected,
  filters,
  orderBy,
  limitValue,
  mode,
}: QueryState & { mode: "many" | "maybeSingle" }) {
  return JSON.stringify({
    table,
    selected: selected ?? null,
    filters,
    orderBy: orderBy ?? null,
    limitValue: limitValue ?? null,
    mode,
  });
}

function responseKey(config: {
  table: string;
  selected?: string;
  filters?: Array<{ type: string; column: string; value: unknown }>;
  orderBy?: { column: string; ascending: boolean };
  limitValue?: number;
  mode?: "many" | "maybeSingle";
}) {
  const filters = config.table === "videos" && !(config.filters ?? []).some((filter) => filter.type === "eq" && filter.column === "lifecycle_state")
    ? [{ type: "eq", column: "lifecycle_state", value: "active" }, ...(config.filters ?? [])]
    : config.filters;
  return serializeQuery({
    table: config.table,
    selected: config.selected,
    filters: filters ?? [],
    orderBy: config.orderBy,
    limitValue: config.limitValue,
    mode: config.mode ?? "many",
  });
}

test("averageMetricRows 会平均 avg_play_ratio，但不会影响空数组兜底", () => {
  assert.equal(averageMetricRows([]), null);
  const averaged = averageMetricRows([
    makeMetricRow({ avg_play_ratio: 0.2 }),
    makeMetricRow({ avg_play_ratio: 0.8 }),
  ]);
  assert.equal(averaged?.avg_play_ratio, 0.5);
});

test("getShanghaiTodayStartIso 始终返回上海日历日零点的 ISO 字符串", async (t) => {
  const RealDate = Date;
  class MockDate extends Date {
    constructor(value?: string | number | Date) {
      super(value ?? "2026-07-18T16:30:00.000Z");
    }

    static now() {
      return new RealDate("2026-07-18T16:30:00.000Z").getTime();
    }
  }

  Object.defineProperty(globalThis, "Date", {
    value: MockDate,
    configurable: true,
  });
  t.after(() => {
    Object.defineProperty(globalThis, "Date", {
      value: RealDate,
      configurable: true,
    });
  });

  assert.equal(getShanghaiTodayStartIso(), "2026-07-18T16:00:00.000Z");
});

test("getReferenceMetrics 在 self 下按最近三条且保持视频顺序聚合", async () => {
  const recentIds = ["v3", "v2", "v1"];
  const responses: ResponseMap = {
    [responseKey({
      table: "videos",
      selected: "id",
      filters: [
        { type: "eq", column: "account_id", value: "acc-1" },
        { type: "neq", column: "id", value: "video-current" },
        { type: "lt", column: "published_at", value: "2026-07-19T10:00:00Z" },
      ],
      orderBy: { column: "published_at", ascending: false },
      limitValue: 3,
    })]: recentIds.map((id) => ({ id })),
    [responseKey({
      table: "video_metrics_snapshots",
      selected:
        "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, avg_play_ratio, follower_gain, likes, comments, shares, favorites",
      filters: [
        { type: "in", column: "video_id", value: recentIds },
        { type: "eq", column: "snapshot_type", value: "24h" },
      ],
    })]: [
      makeMetricRow({ video_id: "v1", play_count: 100, avg_play_ratio: 0.2 }),
      makeMetricRow({ video_id: "v2", play_count: 200, avg_play_ratio: 0.4 }),
      makeMetricRow({ video_id: "v3", play_count: 300, avg_play_ratio: 0.6 }),
    ],
  };
  const stub = createSupabaseStub(responses);

  const result = await getReferenceMetrics({
    supabase: stub.client as never,
    videoId: "video-current",
    video: {
      account_id: "acc-1",
      user_id: "user-1",
      published_at: "2026-07-19T10:00:00Z",
    },
    ref: "self",
  });

  assert.equal(result.refLabel, "对比自己近3条");
  assert.equal(result.refCount, 3);
  assert.deepEqual(result.referenceRows.map((row) => row.play_count), [300, 200, 100]);
  assert.equal(result.reference?.play_count, 200);
});

test("getReferenceMetrics 在 team 下使用上海今日起点", async (t) => {
  const RealDate = Date;
  class MockDate extends Date {
    constructor(value?: string | number | Date) {
      super(value ?? "2026-07-18T16:30:00.000Z");
    }

    static now() {
      return new RealDate("2026-07-18T16:30:00.000Z").getTime();
    }
  }

  Object.defineProperty(globalThis, "Date", {
    value: MockDate,
    configurable: true,
  });
  t.after(() => {
    Object.defineProperty(globalThis, "Date", {
      value: RealDate,
      configurable: true,
    });
  });

  const shanghaiStartIso = "2026-07-18T16:00:00.000Z";
  const responses: ResponseMap = {
    [responseKey({
      table: "profiles",
      selected: "team_id",
      filters: [{ type: "eq", column: "id", value: "user-1" }],
      mode: "maybeSingle",
    })]: { team_id: "team-1" },
    [responseKey({
      table: "profiles",
      selected: "id",
      filters: [{ type: "eq", column: "team_id", value: "team-1" }],
    })]: [{ id: "user-1" }, { id: "user-2" }],
    [responseKey({
      table: "accounts",
      selected: "id",
      filters: [{ type: "in", column: "profile_id", value: ["user-1", "user-2"] }],
    })]: [{ id: "acc-1" }, { id: "acc-2" }],
    [responseKey({
      table: "videos",
      selected: "id",
      filters: [
        { type: "in", column: "account_id", value: ["acc-1", "acc-2"] },
        { type: "neq", column: "id", value: "video-current" },
        { type: "gte", column: "published_at", value: shanghaiStartIso },
      ],
    })]: [{ id: "team-video-1" }, { id: "team-video-2" }],
    [responseKey({
      table: "video_metrics_snapshots",
      selected:
        "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, avg_play_ratio, follower_gain, likes, comments, shares, favorites",
      filters: [
        { type: "in", column: "video_id", value: ["team-video-1", "team-video-2"] },
        { type: "eq", column: "snapshot_type", value: "24h" },
      ],
    })]: [
      makeMetricRow({ video_id: "team-video-1", play_count: 100 }),
      makeMetricRow({ video_id: "team-video-2", play_count: 200 }),
    ],
  };
  const stub = createSupabaseStub(responses);

  const result = await getReferenceMetrics({
    supabase: stub.client as never,
    videoId: "video-current",
    video: {
      account_id: "acc-1",
      user_id: "user-1",
      published_at: "2026-07-19T10:00:00Z",
    },
    ref: "team",
  });

  assert.equal(result.refLabel, "对比团队均值");
  assert.equal(result.refCount, 2);
  const teamVideosQuery = stub.queries.find((query) => query.table === "videos" && query.filters.some((filter) => filter.type === "gte"));
  assert.equal(
    teamVideosQuery?.filters.find((filter) => filter.type === "gte")?.value,
    shanghaiStartIso,
  );
});

test("getReferenceMetrics 在 top 下只返回一条最高播放参照", async () => {
  const responses: ResponseMap = {
    [responseKey({
      table: "profiles",
      selected: "team_id",
      filters: [{ type: "eq", column: "id", value: "user-1" }],
      mode: "maybeSingle",
    })]: { team_id: "team-1" },
    [responseKey({
      table: "profiles",
      selected: "id",
      filters: [{ type: "eq", column: "team_id", value: "team-1" }],
    })]: [{ id: "user-1" }],
    [responseKey({
      table: "accounts",
      selected: "id",
      filters: [{ type: "in", column: "profile_id", value: ["user-1"] }],
    })]: [{ id: "acc-1" }],
    [responseKey({
      table: "videos",
      selected: "id",
      filters: [
        { type: "in", column: "account_id", value: ["acc-1"] },
        { type: "neq", column: "id", value: "video-current" },
        { type: "gte", column: "published_at", value: getShanghaiTodayStartIso() },
      ],
    })]: [{ id: "team-video-1" }, { id: "team-video-2" }],
    [responseKey({
      table: "video_metrics_snapshots",
      selected:
        "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, avg_play_ratio, follower_gain, likes, comments, shares, favorites",
      filters: [
        { type: "in", column: "video_id", value: ["team-video-1", "team-video-2"] },
        { type: "eq", column: "snapshot_type", value: "24h" },
      ],
      orderBy: { column: "play_count", ascending: false },
      limitValue: 1,
      mode: "maybeSingle",
    })]: makeMetricRow({ video_id: "team-video-2", play_count: 999 }),
  };
  const stub = createSupabaseStub(responses);

  const result = await getReferenceMetrics({
    supabase: stub.client as never,
    videoId: "video-current",
    video: {
      account_id: "acc-1",
      user_id: "user-1",
      published_at: "2026-07-19T10:00:00Z",
    },
    ref: "top",
  });

  assert.equal(result.refLabel, "对比今日团队最高播放");
  assert.equal(result.refCount, 1);
  assert.equal(result.referenceRows[0]?.play_count, 999);
  assert.equal(result.reference?.play_count, 999);
});

test("getReferenceMetrics 在 user 下取指定人近三条", async () => {
  const responses: ResponseMap = {
    [responseKey({
      table: "accounts",
      selected: "id",
      filters: [{ type: "eq", column: "profile_id", value: "user-2" }],
    })]: [{ id: "acc-2" }],
    [responseKey({
      table: "videos",
      selected: "id",
      filters: [{ type: "in", column: "account_id", value: ["acc-2"] }],
      orderBy: { column: "published_at", ascending: false },
      limitValue: 3,
    })]: [{ id: "u3" }, { id: "u2" }, { id: "u1" }],
    [responseKey({
      table: "video_metrics_snapshots",
      selected:
        "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, avg_play_ratio, follower_gain, likes, comments, shares, favorites",
      filters: [
        { type: "in", column: "video_id", value: ["u3", "u2", "u1"] },
        { type: "eq", column: "snapshot_type", value: "24h" },
      ],
    })]: [
      makeMetricRow({ video_id: "u1", play_count: 10 }),
      makeMetricRow({ video_id: "u2", play_count: 20 }),
      makeMetricRow({ video_id: "u3", play_count: 30 }),
    ],
  };
  const stub = createSupabaseStub(responses);

  const result = await getReferenceMetrics({
    supabase: stub.client as never,
    videoId: "video-current",
    video: {
      account_id: "acc-1",
      user_id: "user-1",
      published_at: "2026-07-19T10:00:00Z",
    },
    ref: "user",
    refUserId: "user-2",
  });

  assert.equal(result.refLabel, "对比指定人近3条");
  assert.equal(result.refCount, 3);
  assert.deepEqual(result.referenceRows.map((row) => row.play_count), [30, 20, 10]);
});

test("getLegacyComparisonData 仅在 self 时查询 previous 和 recent3", async () => {
  const responses: ResponseMap = {
    [responseKey({
      table: "videos",
      selected: "id, video_title, published_at",
      filters: [
        { type: "eq", column: "account_id", value: "acc-1" },
        { type: "lt", column: "published_at", value: "2026-07-19T10:00:00Z" },
      ],
      orderBy: { column: "published_at", ascending: false },
      limitValue: 1,
      mode: "maybeSingle",
    })]: { id: "prev-1", video_title: "上一条", published_at: "2026-07-18T10:00:00Z" },
    [responseKey({
      table: "videos",
      selected: "id, published_at",
      filters: [
        { type: "eq", column: "account_id", value: "acc-1" },
        { type: "neq", column: "id", value: "video-current" },
        { type: "lt", column: "published_at", value: "2026-07-19T10:00:00Z" },
      ],
      orderBy: { column: "published_at", ascending: false },
      limitValue: 3,
    })]: [{ id: "prev-1" }, { id: "prev-2" }, { id: "prev-3" }],
    [responseKey({
      table: "video_metrics_snapshots",
      selected:
        "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, avg_play_ratio, follower_gain, likes, comments, shares, favorites",
      filters: [
        { type: "in", column: "video_id", value: ["prev-1", "prev-1", "prev-2", "prev-3"] },
        { type: "eq", column: "snapshot_type", value: "24h" },
      ],
    })]: [
      makeMetricRow({ video_id: "prev-1", play_count: 100 }),
      makeMetricRow({ video_id: "prev-2", play_count: 200 }),
      makeMetricRow({ video_id: "prev-3", play_count: 300 }),
    ],
  };
  const stub = createSupabaseStub(responses);

  const selfResult = await getLegacyComparisonData({
    supabase: stub.client as never,
    videoId: "video-current",
    video: {
      account_id: "acc-1",
      published_at: "2026-07-19T10:00:00Z",
    },
    ref: "self",
  });

  assert.equal(selfResult.previous?.title, "上一条");
  assert.equal(selfResult.previous?.play_count, 100);
  assert.equal(selfResult.recent3?.count, 3);
  assert.equal(selfResult.recent3?.play_count, 200);

  const beforeTopCalls = stub.queries.length;
  const topResult = await getLegacyComparisonData({
    supabase: stub.client as never,
    videoId: "video-current",
    video: {
      account_id: "acc-1",
      published_at: "2026-07-19T10:00:00Z",
    },
    ref: "top",
  });

  assert.deepEqual(topResult, { previous: null, recent3: null });
  assert.equal(stub.queries.length, beforeTopCalls);
});
