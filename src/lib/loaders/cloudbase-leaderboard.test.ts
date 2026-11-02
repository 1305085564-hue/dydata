import assert from "node:assert/strict";
import test from "node:test";
import { loadCloudBaseLeaderboardRows } from "./cloudbase-leaderboard";

function report(id: string, reportDate = "2026-11-02", publishedAt: string | null = null) {
  return { id, account_id: `account-${id}`, report_date: reportDate, created_at: "2026-11-02T10:00:00+00:00",
    account: { name: id, profile_id: "visible", content_direction: null, presentation_format: null, profile: { name: "owner" } },
    video: publishedAt ? { published_at: publishedAt } : null,
    play_count: 100, likes: 2, comments: 3, shares: 4, favorites: 5, follower_gain: 6,
    follower_convert: 7, completion_rate: null, avg_play_duration: "8", bounce_rate_2s: "9", completion_rate_5s: "10" };
}

function fake(branches: ReturnType<typeof report>[][], fail = false) {
  const calls: { selection: string; filters: unknown[]; range?: number[] }[] = [];
  const client = { from(table: string) {
    assert.equal(table, "daily_reports");
    const call = { selection: "", filters: [] as unknown[], range: undefined as number[] | undefined }; calls.push(call);
    const query = {
      select(value: string) { call.selection = value; return query; },
      or(value: string) { call.filters.push(["or", value]); return query; },
      in(key: string, values: string[]) { call.filters.push(["in", key, values]); return query; },
      order(key: string, value: unknown) { call.filters.push(["order", key, value]); return query; },
      range(start: number, end: number) { call.range = [start, end]; return query; },
      abortSignal() { return query; },
      gte(key: string, value: string) { call.filters.push(["gte", key, value]); return query; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const rows = branches[call.selection.includes("fkey!inner") ? 1 : 0];
        return Promise.resolve({ data: rows.slice(call.range![0], call.range![1] + 1), error: fail ? { message: "failed" } : null }).then(resolve, reject);
      },
    }; return query;
  } };
  return { client: client as never, calls };
}

test("CloudBase uses both original date predicates, deduplicates reports, retains all 18 RPC output columns", async () => {
  const a = report("a", "2026-11-02", "2026-10-01T16:30:00Z"); // recent report, older publication must still qualify
  const b = report("b", "2026-09-01", "2026-11-01T16:30:00Z"); // old report, recent publication
  const c = report("c", "2026-11-01");
  const { client, calls } = fake([[a, c], [b]]);
  const rows = await loadCloudBaseLeaderboardRows(client, "2026-10-03", ["visible"]);
  assert.deepEqual(rows.map((r) => [r.account_name, r.report_date]), [["b", "2026-11-02"], ["c", "2026-11-01"], ["a", "2026-10-02"]]);
  assert.equal(Object.keys(rows[0]).length, 18);
  assert.equal(rows[0].follower_convert, 7);
  assert.equal(rows[0].completion_rate, null);
  assert.deepEqual(calls[0].filters.slice(0, 2), [["or", "is_void.is.null,is_void.eq.false"], ["in", "account.profile_id", ["visible"]]]);
  assert.ok(calls[0].filters.some((v) => JSON.stringify(v) === JSON.stringify(["gte", "report_date", "2026-10-03"])));
  assert.ok(calls[1].filters.some((v) => JSON.stringify(v) === JSON.stringify(["gte", "video.published_at", "2026-10-03T00:00:00+08:00"])));
});

test("CloudBase paginates both legs and never emits duplicate report rows", async () => {
  const reports = Array.from({ length: 501 }, (_, i) => report(String(i)));
  const { client, calls } = fake([reports, [reports[0]]]);
  const rows = await loadCloudBaseLeaderboardRows(client, "2026-10-03", ["visible"]);
  assert.equal(rows.length, 501);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].range, [500, 999]);
});

test("CloudBase empty visible scope performs no privileged read", async () => {
  const { client, calls } = fake([[], []]);
  assert.deepEqual(await loadCloudBaseLeaderboardRows(client, "2026-10-03", []), []);
  assert.equal(calls.length, 0);
});

test("CloudBase same-day ordering preserves PostgreSQL fractional-second precision and offsets", async () => {
  const a = report("a"), b = report("b"), c = report("c"), d = report("d");
  a.created_at = "2026-11-02T10:00:00+00:00";
  b.created_at = "2026-11-02T10:00:00.123001+00:00";
  c.created_at = "2026-11-02T10:00:00.123002+00:00";
  d.created_at = "2026-11-02T19:00:00+08:00";
  const { client } = fake([[a, b, c, d], []]);
  const rows = await loadCloudBaseLeaderboardRows(client, "2026-10-03", ["visible"]);
  assert.deepEqual(rows.map((r) => r.account_name), ["d", "c", "b", "a"]);
});

test("CloudBase read failure rejects instead of producing a partial or empty success", async () => {
  const { client } = fake([[report("a")], []], true);
  await assert.rejects(loadCloudBaseLeaderboardRows(client, "2026-10-03", ["visible"]));
});
