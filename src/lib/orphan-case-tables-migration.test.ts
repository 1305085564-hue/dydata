import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const MIGRATION = "20260926230000_retire_orphan_case_tables.sql";

const migrationSql = readFileSync(
  new URL(`../../supabase/migrations/${MIGRATION}`, import.meta.url),
  "utf8",
);

/** 去掉 -- 注释行，只保留可执行 SQL：注释里说明历史时提到对象名不算"引用"。 */
function executableSql(source: string) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const executable = executableSql(migrationSql);

/** 待清理表名从迁移里的 DROP 语句推导，避免在测试里再写一遍对象名。 */
const droppedTables = Array.from(
  executable.matchAll(/DROP TABLE IF EXISTS public\.([a-z_]+);/g),
).map((match) => match[1]);

test("待清理对象可从迁移推导：两张表且不重复", () => {
  assert.equal(droppedTables.length, 2, "本批应恰好清理两张已授权表");
  assert.equal(new Set(droppedTables).size, droppedTables.length, "清单不得重复");
});

test("不使用 CASCADE，且删表语句幂等（IF EXISTS，空库重放为 no-op）", () => {
  assert.doesNotMatch(executable, /cascade/i, "不得用 CASCADE 掩盖依赖问题");
  for (const table of droppedTables) {
    assert.match(executable, new RegExp(`DROP TABLE IF EXISTS public\\.${table};`));
  }
});

test("失去唯一调用方的触发器函数必须在删表之后删除", () => {
  const dropTableIndex = executable.search(/DROP TABLE IF EXISTS public\.[a-z_]+;/);
  const dropFunctionIndex = executable.search(/DROP FUNCTION IF EXISTS public\.[a-z_]+\(\);/);
  assert.ok(dropFunctionIndex >= 0, "必须显式删除函数依赖，不能留下引用已删表的孤儿函数");
  assert.ok(
    dropTableIndex >= 0 && dropFunctionIndex > dropTableIndex,
    "删函数必须排在删表之后，否则触发器仍依赖它而报错",
  );
});

test("建表迁移必须排在本迁移之前（避免空库重放删完又把它造回来）", () => {
  const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));

  for (const table of droppedTables) {
    const creators = files.filter((name) =>
      readFileSync(new URL(name, migrationsDir), "utf8")
        .toLowerCase()
        .includes(`create table if not exists public.${table}`),
    );
    assert.ok(creators.length > 0, `${table} 必须能找到建表迁移（回滚 recipe 依赖它）`);
    for (const creator of creators) {
      assert.ok(creator < MIGRATION, `${creator} 创建 ${table} 必须排在本迁移之前`);
    }
  }
});

test("回滚 recipe 点名真实存在的建表来源迁移，并覆盖每一张被删表", () => {
  const rollbackStart = migrationSql.indexOf("-- ROLLBACK");
  assert.ok(rollbackStart >= 0, "必须有 ROLLBACK 段落");
  const rollbackSection = migrationSql.slice(rollbackStart);

  const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
  const files = readdirSync(migrationsDir);
  const referenced = Array.from(rollbackSection.matchAll(/(\d+_[a-z_]+\.sql)/g)).map((m) => m[1]);
  assert.ok(referenced.length >= 2, "回滚 recipe 必须点名两张表各自的建表来源迁移");
  for (const name of referenced) {
    assert.ok(files.includes(name), `${name} 必须是真实存在的迁移文件`);
  }
  for (const table of droppedTables) {
    assert.match(rollbackSection, new RegExp(table), `回滚 recipe 必须覆盖 ${table}`);
  }
});

test("40 行数据快照完整，且通过/失败分布与线上计数一致", () => {
  const seeded = Array.from(migrationSql.matchAll(/^--\s*insert into public\.([a-z_]+)/gm));
  assert.equal(seeded.length, 40, "删除前共 40 行，必须逐行留档以便回灌");

  const passedFlags = Array.from(
    migrationSql.matchAll(
      /'[0-9a-f-]{36}', '[0-9a-f-]{36}', '[0-9a-f-]{36}', '[^']*', (?:'[0-9a-f-]{36}'|NULL), '([tf])',/g,
    ),
  ).map((match) => match[1]);
  assert.equal(passedFlags.length, 40);
  assert.equal(passedFlags.filter((flag) => flag === "t").length, 22);
  assert.equal(passedFlags.filter((flag) => flag === "f").length, 18);
});

test("迁移只允许 DROP 已授权对象，不得夹带其它写操作", () => {
  const statements = executable
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  assert.equal(statements.length, 3, "本迁移应恰好三条语句：删表 → 删函数 → 删表");
  for (const statement of statements) {
    assert.match(
      statement,
      /^(DROP TABLE IF EXISTS public\.[a-z_]+|DROP FUNCTION IF EXISTS public\.[a-z_]+\(\))$/,
      `发现越界语句：${statement}`,
    );
  }
});
