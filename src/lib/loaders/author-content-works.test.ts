import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { AppError } from "@/lib/errors";
import type { AdminContentListArgs, AdminContentPageData } from "./admin-content-page";
import { loadAuthorContentWorks } from "./author-content-works";

const NOW = new Date("2026-10-30T04:00:00.000Z");
const AUTHOR = { userId: "author-1", name: "作者一" };

type ContentVideo = AdminContentPageData["videos"][number];
type Snapshot = AdminContentPageData["snapshots"][number];

function videoAt(index: number): ContentVideo {
  return {
    id: `video-${index}`,
    account_id: "account-1",
    user_id: AUTHOR.userId,
    video_url: null,
    video_title: `作品 ${index}`,
    content: null,
    published_at: "2026-10-15T00:00:00.000Z",
    uploaded_at: "2026-10-15T00:00:00.000Z",
    anomaly_status: "normal",
    review_status: "pending",
    reviewed_at: null,
    lifecycle_state: "active",
    trashed_at: null,
    trashed_by: null,
    purged_at: null,
    purged_by: null,
    created_at: "2026-10-15T00:00:00.000Z",
    accounts: { name: "账号一", profile_id: AUTHOR.userId },
    profiles: { name: AUTHOR.name },
  } as ContentVideo;
}

function snapshotAt(index: number): Snapshot {
  return {
    id: `snapshot-${index}`,
    video_id: `video-${index}`,
    snapshot_type: "24h",
    captured_at: "2026-10-16T00:00:00.000Z",
    play_count: index,
    completion_rate: null,
  } as Snapshot;
}

function pageData(indices: number[], totalVideos: number): AdminContentPageData {
  const videos = indices.map(videoAt);
  return {
    evaluationStandards: DEFAULT_EVALUATION_STANDARDS,
    videos,
    snapshots: indices.map(snapshotAt),
    profiles: [],
    reviewReadiness: {},
    contentQualityByVideoId: {},
    summary: { totalVideos },
  };
}

function pagedLoader(totalVideos: number, calls: AdminContentListArgs[] = []) {
  return async (args: AdminContentListArgs): Promise<AdminContentPageData> => {
    calls.push(args);
    const page = args.query?.page ?? 1;
    const pageSize = args.query?.pageSize ?? 500;
    const start = (page - 1) * pageSize;
    const end = Math.min(totalVideos, start + pageSize);
    return pageData(Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i), totalVideos);
  };
}

function args(params: Partial<Parameters<typeof loadAuthorContentWorks>[0]["params"]> = {}) {
  return {
    supabase: {} as never,
    scope: { visibleUserIds: [AUTHOR.userId], teamId: "team-1" } as never,
    author: AUTHOR,
    params: { userId: AUTHOR.userId, ...params },
  } as Parameters<typeof loadAuthorContentWorks>[0];
}

test("501 条作品分两批加载，画像 summary 覆盖完整周期", async () => {
  const calls: AdminContentListArgs[] = [];
  const result = await loadAuthorContentWorks(
    args({ timeRange: "all", pageSize: 100, page: 1 }),
    pagedLoader(501, calls),
    NOW,
  );

  assert.deepEqual(calls.map((call) => call.query?.page), [1, 2]);
  assert.ok(calls.every((call) => call.query?.pageSize === 500));
  assert.equal(result.summary.totalWorksCount, 501);
  assert.equal(result.summary.measuredWorksCount, 501);
  assert.equal(result.summary.averagePlayCount, 250);
  assert.equal(result.total, 501);
  assert.equal(result.works.length, 100);
  assert.equal(calls[0]?.query?.filters.userId, AUTHOR.userId);
  assert.equal(calls[0]?.query?.filters.startDate, "0001-01-01");
  assert.equal(calls[0]?.query?.filters.endDate, "9999-12-31");
});

test("1001 条作品分页时 page 2 取正确切片，并传递周期、作者及排序", async () => {
  const calls: AdminContentListArgs[] = [];
  const result = await loadAuthorContentWorks(
    args({
      timeRange: "thisMonth",
      sortField: "play_count",
      sortDir: "asc",
      pageSize: 100,
      page: 2,
    }),
    pagedLoader(1001, calls),
    NOW,
  );

  assert.deepEqual(calls.map((call) => call.query?.page), [1, 2, 3]);
  assert.equal(result.summary.totalWorksCount, 1001);
  assert.equal(result.summary.averagePlayCount, 500);
  assert.deepEqual(result.works.map((video) => video.id),
    Array.from({ length: 100 }, (_, index) => `video-${index + 100}`));
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 100);
  assert.equal(result.total, 1001);
  assert.equal(result.hasNextPage, true);

  for (const call of calls) {
    assert.equal(call.query?.filters.userId, AUTHOR.userId);
    assert.equal(call.query?.filters.timeRange, "custom");
    assert.equal(call.query?.filters.startDate, "2026-10-01");
    assert.equal(call.query?.filters.endDate, "2026-10-30");
    assert.equal(call.query?.sortField, "play_count");
    assert.equal(call.query?.sortDir, "asc");
    assert.equal(call.query?.teamId, "team-1");
  }
});

test("作者超出当前可见范围时拒绝且不调用列表 loader", async () => {
  let callCount = 0;
  const loadList = async () => {
    callCount++;
    return pageData([], 0);
  };

  await assert.rejects(
    loadAuthorContentWorks(
      { ...args(), scope: { visibleUserIds: ["other-user"], teamId: "team-1" } as never },
      loadList,
      NOW,
    ),
    (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
  );
  assert.equal(callCount, 0);
});

test("第二批加载失败时原样报错，不返回部分画像", async () => {
  const failure = new Error("second batch failed");
  const loadList = async (input: AdminContentListArgs) => {
    if (input.query?.page === 2) throw failure;
    return pageData(Array.from({ length: 500 }, (_, index) => index), 501);
  };

  await assert.rejects(
    loadAuthorContentWorks(args({ timeRange: "all" }), loadList, NOW),
    (error: unknown) => error === failure,
  );
});

test("重复作品或分页期间总数变化时报告冲突", async (t) => {
  await t.test("重复 id", async () => {
    const loadList = async (input: AdminContentListArgs) => input.query?.page === 1
      ? pageData(Array.from({ length: 500 }, (_, index) => index), 501)
      : pageData([499], 501);

    await assert.rejects(
      loadAuthorContentWorks(args({ timeRange: "all" }), loadList, NOW),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    );
  });

  await t.test("总数变化", async () => {
    const loadList = async (input: AdminContentListArgs) => input.query?.page === 1
      ? pageData(Array.from({ length: 500 }, (_, index) => index), 501)
      : pageData([500], 502);

    await assert.rejects(
      loadAuthorContentWorks(args({ timeRange: "all" }), loadList, NOW),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    );
  });
});

test("超过 10000 条时立即报错，不继续取后续批次", async () => {
  let callCount = 0;
  const loadList = async () => {
    callCount++;
    return pageData([], 10001);
  };

  await assert.rejects(
    loadAuthorContentWorks(args({ timeRange: "all" }), loadList, NOW),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_INPUT",
  );
  assert.equal(callCount, 1);
});
