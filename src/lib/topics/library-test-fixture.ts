import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;

export const VERIFIED_TEAM_ID = "123e4567-e89b-42d3-a456-426614174099";

let idCounter = 0;

function makeQuery(rows: Row[]) {
  const query: Record<string, unknown> = {
    eq(col: string, val: unknown) {
      return makeQuery(rows.filter((row) => row[col] === val));
    },
    in(col: string, vals: unknown[]) {
      return makeQuery(rows.filter((row) => vals.includes(row[col])));
    },
    neq(col: string, val: unknown) {
      return makeQuery(rows.filter((row) => row[col] !== val));
    },
    order() {
      return query;
    },
    limit(count: number) {
      return makeQuery(rows.slice(0, count));
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({
      data: rows[0] ?? null,
      error: rows[0] ? null : { message: "row not found" },
    }),
    then(resolve: (value: { data: Row[]; error: null }) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return query;
}

export function createFakeSupabase(db: Record<string, Row[]>, options: { failAudit?: boolean } = {}) {
  const inserted: Array<{ table: string; payload: Row | Row[] }> = [];
  const client = {
    from(table: string) {
      const rows = db[table] ?? (db[table] = []);
      return {
        select() {
          return makeQuery([...rows]);
        },
        insert(payload: Row | Row[]) {
          const shouldFail = table === "audit_logs" && options.failAudit;
          if (shouldFail) {
            return {
              then(resolve: (value: { data: null; error: { message: string } }) => unknown) {
                return Promise.resolve({ data: null, error: { message: "audit unavailable" } }).then(resolve);
              },
            };
          }
          inserted.push({ table, payload });
          const newRows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
            id: `gen-${++idCounter}`,
            ...row,
          }));
          return {
            select() {
              return {
                single: async () => {
                  rows.push(...newRows);
                  return { data: newRows[0], error: null };
                },
                then(resolve: (value: { data: Row[]; error: null }) => unknown) {
                  rows.push(...newRows);
                  return Promise.resolve({ data: newRows, error: null }).then(resolve);
                },
              };
            },
            then(resolve: (value: { data: Row[]; error: null }) => unknown) {
              rows.push(...newRows);
              return Promise.resolve({ data: newRows, error: null }).then(resolve);
            },
          };
        },
        update(patch: Row) {
          return {
            eq(col: string, val: unknown) {
              const applyPatch = () => {
                const target = rows.find((row) => row[col] === val);
                if (target) Object.assign(target, patch);
                return target;
              };
              return {
                select() {
                  return {
                    single: async () => {
                      const target = applyPatch();
                      if (!target) return { data: null, error: { message: "row not found" } };
                      return { data: { ...target }, error: null };
                    },
                  };
                },
                then(resolve: (value: { data: Row[]; error: null }) => unknown) {
                  const target = applyPatch();
                  return Promise.resolve({ data: target ? [{ ...target }] : [], error: null }).then(resolve);
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, inserted };
}

export function seedQualifiedVideo(
  db: Record<string, Row[]>,
  overrides: Partial<Row> & { id?: string } = {},
) {
  const videoId = (overrides.id as string) ?? "video-1";
  db.videos = [{
    id: videoId,
    user_id: "member-1",
    video_title: "打板连板核心手法拆解",
    content: "一期讲透打板连板的干货内容",
    topic_id: null,
    lifecycle_state: "active",
    ...overrides,
  }];
  db.video_tags = [{ video_id: videoId, tag_dimension: "话题", tag_value: "干货" }];
  db.video_metrics_snapshots = [{
    video_id: videoId,
    snapshot_type: "24h",
    play_count: 30000,
    captured_at: "2026-08-29T10:00:00Z",
  }];
  db.sub_topics = db.sub_topics ?? [];
  db.profiles = [{ id: "member-1", team_id: VERIFIED_TEAM_ID }];
  return videoId;
}

export function seedGroups(db: Record<string, Row[]>) {
  db.topic_groups = [
    { id: "group-ban", name: "打板连板", topic_id: "topic-violent" },
    { id: "group-jiandu", name: "政策精读", topic_id: "topic-news" },
  ];
}
