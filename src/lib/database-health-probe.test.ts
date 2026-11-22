import assert from "node:assert/strict";
import test from "node:test";

type FakeSelectResult = {
  data: Array<{ id: string }> | null;
  error: { message: string } | null;
};

test("probeDatabaseHealth 只读取 1 条 profiles 记录", async () => {
  const calls: Array<{ table: string; columns: string; limit: number }> = [];

  const mod = await import(new URL("./database-health-probe.ts", import.meta.url).href);
  const { probeDatabaseHealth } = mod;

  const result = await probeDatabaseHealth({
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

test("probeDatabaseHealth 遇到数据库错误会抛出异常", async () => {
  const mod = await import(new URL("./database-health-probe.ts", import.meta.url).href);
  const { probeDatabaseHealth } = mod;

  await assert.rejects(
    () => probeDatabaseHealth({
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
