import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentQueryFingerprint,
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
  assert.equal(query.pageSize, 20);
  assert.equal(query.sortField, "published_at");
  assert.equal(query.sortDir, "desc");
  assert.equal(normalizeContentPage("10001"), 10_000);
  assert.equal(normalizeContentPageSize("50"), 50);
});
test("游标编码往返并拒绝伪造形状", () => {
  const encoded = encodeContentCursor({
    queryFingerprint: "fingerprint",
    sortValue: "2026-10-21T00:00:00.000Z",
    id: "video-1",
    direction: "after",
  });
  assert.deepEqual(decodeContentCursor(encoded), {
    queryFingerprint: "fingerprint",
    sortValue: "2026-10-21T00:00:00.000Z",
    id: "video-1",
    direction: "after",
  });
  assert.equal(decodeContentCursor("not-json"), null);
});

test("查询指纹包含页容量、筛选和排序", () => {
  const base = {
    view: "all" as const,
    perspective: "company" as const,
    teamId: null,
    pageSize: 20,
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
