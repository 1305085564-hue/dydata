import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { NextRequest } from "next/server";
import { buildVideoSubmitResponse, type VideoSubmitDeps } from "./route-core";
import { buildSubmissionRecordId } from "./stability";
import { validateVideoSubmitPayload } from "./validation";
import { rollbackSafely } from "./persistence-orchestrator";

const USER = "123e4567-e89b-42d3-a456-426614174001";
const ACCOUNT = "223e4567-e89b-42d3-a456-426614174002";
const REPORT = "323e4567-e89b-42d3-a456-426614174003";
const OTHER = "423e4567-e89b-42d3-a456-426614174004";
const base = {
  mode: "abnormal", account_id: ACCOUNT, biz_date: "2026-11-20", video_title: "合成异常作品",
  video_url: null, content: "真实测试文案", anomaly_status: "abnormal", punish_type: "deleted",
  platform_notice: null, appeal: null, published_at: "2026-11-20T08:00:00.000Z",
  published_at_text: "2026-11-20 16:00:00", topic_tag: null, video_form: null,
  content_keywords: [], script_author_user_id: USER, video_editor_user_id: USER, operator_user_id: USER,
  assets: [], metrics: {
    play_count: 100, likes: 2, comments: 1, shares: 1, favorites: 1, follower_gain: 0,
    follower_loss: 0, follower_convert: 0, avg_play_duration: 10,
    bounce_rate_2s: 20, completion_rate_5s: 30, completion_rate: 40,
  },
};
const normalized = validateVideoSubmitPayload(base);
assert.ok(normalized.ok);
const ID = buildSubmissionRecordId(normalized.normalized);
type Row = Record<string, unknown>;
type DbResult = { data: unknown; error: { code?: string; message: string } | null };

// 数据库边界 fake：真实路由、预检、写入编排、回滚都不替换。数据库唯一键在执行 insert 时生效。
function fixture(state: "active" | "trashed" | "purged" | "other" | "new" = "active", failSnapshot = false) {
  const tables: Record<string, Row[]> = {
    profiles: [{ id: USER, name: "合成成员", team_id: "team-own", membership_status: "active" }],
    accounts: [{ id: ACCOUNT, profile_id: USER, name: "合成账号" }],
    videos: state === "new" ? [] : [{
      id: ID, account_id: ACCOUNT, user_id: state === "other" ? OTHER : USER,
      lifecycle_state: state === "other" ? "active" : state, published_at: base.published_at,
      video_title: "原始标题", topic_id: null,
    }],
    daily_reports: state === "new" ? [] : [{
      id: REPORT, user_id: USER, account_id: ACCOUNT, video_id: ID, report_date: "2026-11-20", is_void: false,
    }],
    video_metrics_snapshots: state === "new" ? [] : [{ id: "snapshot", video_id: ID, snapshot_type: "24h" }],
    video_tags: [],
  };
  const writes: Array<{ table: string; op: string; role: string }> = [];
  const rpcCalls: Array<{ name: string; args: Row }> = [];
  let failed = false;
  // 两个并发请求都读完“不存在”后再进入 insert，稳定复现检查通过后的唯一键竞争。
  let readCount = 0;
  let release!: () => void;
  const barrier = new Promise<void>((done) => { release = done; });
  let concurrent = false;
  function client(role: string) {
    return {
      auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
      rpc: async (name: string, args: Row) => {
        rpcCalls.push({ name, args });
        assert.equal(name, "transition_video_lifecycle_with_report_link");
        tables.videos[0].lifecycle_state = "active";
        return { data: [{ lifecycle_state: "active" }], error: null };
      },
      from(table: string) {
        assert.ok(Object.hasOwn(tables, table), `unexpected table ${table}`);
        let op = "select";
        let patch: Row = {};
        let maxRows = Infinity;
        const filters: Array<(row: Row) => boolean> = [];
        const query = {
          select() { return query; },
          eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
          in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
          gte(key: string, value: string) { filters.push((row) => String(row[key]) >= value); return query; },
          lt(key: string, value: string) { filters.push((row) => String(row[key]) < value); return query; },
          limit(count: number) { maxRows = count; return query; },
          order() { return query; },
          insert(value: Row) { op = "insert"; patch = value; return query; },
          update(value: Row) { op = "update"; patch = value; return query; },
          delete() { op = "delete"; return query; },
          single: () => execute(true),
          maybeSingle: () => execute(true),
          then(done: (value: DbResult) => unknown, reject: (reason: unknown) => unknown) {
            return execute(false).then(done, reject);
          },
        };
        async function execute(single: boolean): Promise<DbResult> {
          let rows = tables[table].filter((row) => filters.every((filter) => filter(row))).slice(0, maxRows);
          // 不让回滚日志测试的失败被 fake 自己吞掉。
          if (op !== "select") {
            writes.push({ table, op, role });
            if (failed && role === "admin") return { data: null, error: { message: "synthetic rollback failure" } };
            if (failSnapshot && table === "video_metrics_snapshots") {
              failed = true;
              return { data: null, error: new Error("synthetic snapshot business failure") };
            }
          }
          if (concurrent && table === "videos" && op === "select" && single && rows.length === 0) {
            readCount += 1;
            if (readCount === 2) release();
            await barrier;
          }
          if (op === "insert") {
            if (table === "videos" && tables.videos.some((row) => row.id === patch.id)) {
              return { data: null, error: { code: "23505", message: "synthetic duplicate primary key" } };
            }
            const row = { id: table === "daily_reports" ? REPORT : "snapshot", lifecycle_state: "active", ...patch };
            tables[table].push(row);
            rows = [row];
          } else if (op === "update") {
            for (const row of rows) Object.assign(row, patch);
          } else if (op === "delete") {
            tables[table] = tables[table].filter((row) => !rows.includes(row));
          }
          // select 返回独立快照，避免业务更新反向改掉回滚备份。
          const data = rows.map((row) => ({ ...row }));
          return { data: single ? data[0] ?? null : data, error: null };
        }
        return query;
      },
    };
  }
  const deps: VideoSubmitDeps = {
    createClient: async () => client("user") as never,
    createAdminClient: () => client("admin") as never,
  };
  return { tables, writes, rpcCalls, deps, race: () => { concurrent = true; } };
}

function request(edit = false) {
  return new NextRequest("https://example.com/api/video-submit", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...base, ...(edit ? { mode: "edit", video_id: ID } : {}) }),
  });
}

// 所有通知/存储外联在网络边界阻断，测试不会使用环境里的真实凭据访问任何服务。
test.beforeEach(() => {
  mock.method(globalThis, "fetch", async () => { throw new Error("test forbids outbound network"); });
});
test.afterEach(() => mock.restoreAll());

test("固定编号由同一提交内容稳定生成，编辑明确沿用原编号", () => {
  assert.equal(buildSubmissionRecordId(normalized.normalized), ID);
  assert.equal(buildSubmissionRecordId({ ...normalized.normalized, video_id: ID, content: "修改内容" }), ID);
});

for (const state of ["active", "trashed"] as const) {
  test(`${state}：完整编辑入口使用原编号更新，回收站先恢复后更新`, async () => {
    const f = fixture(state);
    const response = await buildVideoSubmitResponse(request(true), f.deps);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const body = await response.json();
    assert.equal(body.video_id, ID);
    assert.equal(f.tables.videos.length, 1);
    assert.equal(f.tables.videos[0].video_title, "合成异常作品");
    assert.equal(f.writes.some((write) => write.table === "videos" && write.op === "insert"), false);
    assert.equal(f.rpcCalls.length, state === "trashed" ? 1 : 0);
    if (state === "trashed") assert.deepEqual(f.rpcCalls[0], {
      name: "transition_video_lifecycle_with_report_link",
      args: { p_video_id: ID, p_action: "restore", p_actor_id: USER, p_restore_reports: false },
    });
  });
  test(`${state}：非编辑模式重复提交同一固定PK按现行契约返回409重复拦截`, async () => {
    const f = fixture(state);
    const response = await buildVideoSubmitResponse(request(), f.deps);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "SUBMISSION_DUPLICATE");
    assert.equal(f.tables.videos.length, 1);
  });
}

for (const state of ["purged", "other"] as const) {
  test(`${state}：固定PK重试返回409且不写入、不恢复记录`, async () => {
    const f = fixture(state);
    const response = await buildVideoSubmitResponse(request(), f.deps);
    assert.equal(response.status, 409);
    assert.equal(typeof (await response.json()).error, "string");
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.rpcCalls, []);
  });
}

test("多表回滚逆序执行，某一步失败后继续清理且返回所有回滚错误", async () => {
  const attempted: string[] = [];
  const result = await rollbackSafely([
    async () => { attempted.push("videos"); throw new Error("video cleanup failed"); },
    async () => { attempted.push("snapshot"); },
    async () => { attempted.push("report"); throw new Error("report cleanup failed"); },
  ]);
  assert.deepEqual(attempted, ["report", "snapshot", "videos"]);
  assert.equal(result?.message, "提交失败后的回滚未完成：report cleanup failed；video cleanup failed");
  assert.equal(await rollbackSafely([async () => {}]), null);
});

test("快照写入失败且回滚也失败时，返回原始业务错误而非回滚错误", async () => {
  const f = fixture("active", true);
  const response = await buildVideoSubmitResponse(request(true), f.deps);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "视频快照创建失败", code: "SNAPSHOT_PERSIST_FAILED" });
  assert.ok(f.writes.some((write) => write.table === "videos" && write.role === "admin"));
});

// BUG_FOUND：runSubmissionPersistenceStep 丢弃 compensate 返回的 rollbackSafely 错误。
test.todo("多表写入失败且回滚失败时必须另行记录回滚错误日志", async (context) => {
  const f = fixture("active", true);
  const errorLog = context.mock.method(console, "error", () => {});
  const response = await buildVideoSubmitResponse(request(true), f.deps);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "视频快照创建失败");
  assert.ok(errorLog.mock.calls.some(({ arguments: args }) =>
    args.some((arg) => String(arg).includes("synthetic rollback failure"))));
});

// BUG_FOUND：检查和 insert 之间存在竞争窗口，唯一键异常目前映射500而非409。
test.todo("两个相同提交并发到达时一个成功，另一个409，不能返回500", async (context) => {
  const f = fixture("new");
  f.race();
  context.mock.method(console, "error", () => {});
  const responses = await Promise.all([
    buildVideoSubmitResponse(request(), f.deps), buildVideoSubmitResponse(request(), f.deps),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(f.tables.videos.length, 1);
});
