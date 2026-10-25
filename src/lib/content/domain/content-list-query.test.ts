import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentQueryFingerprint,
  bindContentListQueryToEffectiveScope,
  decodeContentCursor,
  encodeContentCursor,
  normalizeContentPage,
  normalizeContentPageSize,
  parseContentListQuery,
  writeContentListQuery,
} from "./content-list-query";

test("列表查询非法页码、页容量和排序安全回落", () => {
  const query = parseContentListQuery(
    new URLSearchParams("page=-2&pageSize=999&sort=unknown&dir=wat"),
  );
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 100);
  assert.equal(query.sortField, "published_at");
  assert.equal(query.sortDir, "desc");
  assert.equal(normalizeContentPage("10001"), 10_000);
  assert.equal(normalizeContentPageSize("50"), 50);
});

test("未显式指定排序时单日按播放量降序、多日按发布时间降序，显式排序优先", () => {
  const latestDay = parseContentListQuery(new URLSearchParams());
  assert.equal(latestDay.sortField, "play_count");
  assert.equal(latestDay.sortDir, "desc");

  const yesterday = parseContentListQuery(new URLSearchParams("timeRange=yesterday"));
  assert.equal(yesterday.sortField, "play_count");
  assert.equal(yesterday.sortDir, "desc");

  const customSingleDay = parseContentListQuery(
    new URLSearchParams("timeRange=custom&startDate=2026-10-15&endDate=2026-10-15"),
  );
  assert.equal(customSingleDay.sortField, "play_count");
  assert.equal(customSingleDay.sortDir, "desc");

  const customDateRange = parseContentListQuery(
    new URLSearchParams("timeRange=custom&startDate=2026-10-15&endDate=2026-10-16"),
  );
  assert.equal(customDateRange.sortField, "published_at");
  assert.equal(customDateRange.sortDir, "desc");

  const explicitPublishedSort = parseContentListQuery(
    new URLSearchParams("timeRange=custom&startDate=2026-10-15&endDate=2026-10-15&sort=published_at&dir=desc"),
  );
  assert.equal(explicitPublishedSort.sortField, "published_at");
  assert.equal(explicitPublishedSort.sortDir, "desc");
});

test("游标编码往返并拒绝伪造形状", () => {
  const encoded = encodeContentCursor({
    queryFingerprint: "fingerprint",
    sortValue: "1761033600",
    id: "video-1",
    direction: "after",
  });
  assert.deepEqual(decodeContentCursor(encoded), {
    queryFingerprint: "fingerprint",
    sortValue: "1761033600",
    id: "video-1",
    direction: "after",
  });
  assert.equal(decodeContentCursor("not-json"), null);
});

test("游标 sortValue 必须是数字，非数字按失效处理（服务端会直接转 numeric）", () => {
  const build = (sortValue: string | null) =>
    encodeContentCursor({ queryFingerprint: "fingerprint", sortValue, id: "video-1", direction: "after" });
  assert.equal(decodeContentCursor(build("abc")), null);
  assert.equal(decodeContentCursor(build("2026-10-21T00:00:00.000Z")), null);
  assert.equal(decodeContentCursor(build("")), null);
  assert.equal(decodeContentCursor(build(null))?.sortValue, null);
  assert.equal(decodeContentCursor(build("0"))?.sortValue, "0");
});

test("查询指纹包含页容量、筛选和排序", () => {
  const base = {
    view: "all" as const,
    perspective: "company" as const,
    teamId: null,
    pageSize: 50,
    filters: parseContentListQuery(new URLSearchParams()).filters,
    sortField: "published_at" as const,
    sortDir: "desc" as const,
  };
  assert.notEqual(
    buildContentQueryFingerprint(base),
    buildContentQueryFingerprint({ ...base, pageSize: 100 }),
  );
  const next = writeContentListQuery(new URLSearchParams("keyword=abc"), {
    page: 3,
    pageSize: 50,
    cursor: "cursor",
    sortField: "play_count",
    sortDir: "desc",
  });
  assert.equal(next.get("keyword"), "abc");
  assert.equal(next.get("page"), "3");
  assert.equal(next.get("pageSize"), "50");
  assert.equal(next.get("cursor"), "cursor");
});

test("团队游标指纹使用权限解析后的团队范围，不因 URL 缺少 teamId 变成 stale", () => {
  const trustedTeamId = "c6f07b84-ae8e-454e-bf45-3c797ebf299a";
  const params = new URLSearchParams("view=all&scope=team");
  const parsed = parseContentListQuery(params);
  const initialQuery = {
    ...parsed,
    perspective: "team" as const,
    teamId: null,
  };
  const nextRequestQuery = {
    ...parsed,
    perspective: "team" as const,
    teamId: trustedTeamId,
  };
  const firstEffectiveQuery = bindContentListQueryToEffectiveScope(initialQuery, trustedTeamId);
  const nextEffectiveQuery = bindContentListQueryToEffectiveScope(nextRequestQuery, trustedTeamId);

  assert.equal(firstEffectiveQuery.teamId, trustedTeamId);
  assert.equal(
    buildContentQueryFingerprint(firstEffectiveQuery),
    buildContentQueryFingerprint(nextEffectiveQuery),
  );
  assert.notEqual(
    buildContentQueryFingerprint(firstEffectiveQuery),
    buildContentQueryFingerprint(bindContentListQueryToEffectiveScope(nextRequestQuery, "another-team")),
  );
});
