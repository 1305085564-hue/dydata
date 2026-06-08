import assert from "node:assert/strict";
import test from "node:test";

type FakeSelectResult = {
  data: Array<{ id: string }> | null;
  error: { message: string } | null;
};

test("runSupabaseKeepalive 只读取 1 条 profiles 记录", async () => {
  const calls: Array<{ table: string; columns: string; limit: number }> = [];

  const mod = await import(new URL("./keepalive.ts", import.meta.url).href);
  const { runSupabaseKeepalive } = mod;

  const result = await runSupabaseKeepalive({
    from(table: string) {
      assert.equal(table, "profiles");
      return {
        select(columns: string) {
          return {
            async limit(limit: number): Promise<FakeSelectResult> {
              calls.push({ table, columns, limit });
              return {
                data: [{ id: "user-1" }],
                error: null,
              };
            },
          };
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { table: "profiles", columns: "id", limit: 1 });
  assert.equal(result.table, "profiles");
  assert.equal(result.rowCount, 1);
});

test("runSupabaseKeepalive 遇到 Supabase 错误会抛出异常", async () => {
  const mod = await import(new URL("./keepalive.ts", import.meta.url).href);
  const { runSupabaseKeepalive } = mod;

  await assert.rejects(
    () => runSupabaseKeepalive({
      from() {
        return {
          select() {
            return {
              async limit(): Promise<FakeSelectResult> {
                return {
                  data: null,
                  error: { message: "db down" },
                };
              },
            };
          },
        };
      },
    }),
    /db down/,
  );
});
