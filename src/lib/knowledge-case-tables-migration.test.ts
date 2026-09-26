import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const MIGRATION = "20260926233000_retire_knowledge_case_tables.sql";

const migrationSql = readFileSync(
  new URL(`../../supabase/migrations/${MIGRATION}`, import.meta.url),
  "utf8",
);

/** 去掉注释（整行与行内），只保留可执行 SQL：注释里说明历史时提到对象名不算"引用"。 */
function executableSql(source: string) {
  return source
    .split("\n")
    .map((line) => {
      const commentStart = line.indexOf("--");
      return commentStart >= 0 ? line.slice(0, commentStart) : line;
    })
    .join("\n");
}

const executable = executableSql(migrationSql);

/** 待清理表名从迁移里的 DROP 语句推导，避免在测试里再写一遍对象名。 */
const dropStatements = Array.from(
  executable.matchAll(/DROP TABLE IF EXISTS public\.([a-z_]+);/g),
).map((match) => match[1]);

/**
 * 每张表的外向引用目标写在它 DROP 语句的行尾注释里（`-- → a, b`）。
 * 借此断言"子表先删、被引用的父表后删"，而无需在测试里硬编码外键关系。
 */
const foreignKeyTargets = new Map<string, string[]>();
for (const line of migrationSql.split("\n")) {
  const match = line.match(/^DROP TABLE IF EXISTS public\.([a-z_]+);\s*--\s*→\s*(.+)$/);
  if (!match) continue;
  foreignKeyTargets.set(
    match[1],
    match[2].split(",").map((name) => name.trim()).filter(Boolean),
  );
}

test("待清理对象可从迁移推导：五张表且不重复", () => {
  assert.equal(dropStatements.length, 5, "该家族应为 5 张表");
  assert.equal(new Set(dropStatements).size, dropStatements.length, "清单不得重复");
});

test("不使用 CASCADE，且删表语句幂等（IF EXISTS，空库重放为 no-op）", () => {
  assert.doesNotMatch(executable, /cascade/i, "不得用 CASCADE 掩盖依赖问题");
  for (const table of dropStatements) {
    assert.match(executable, new RegExp(`DROP TABLE IF EXISTS public\\.${table};`));
  }
});

test("子表必须先于被它引用的父表删除", () => {
  assert.ok(foreignKeyTargets.size >= 3, "迁移必须记录各表的出向外键目标（行尾 `-- →` 注释）");

  for (const [child, targets] of foreignKeyTargets) {
    const childIndex = dropStatements.indexOf(child);
    assert.ok(childIndex >= 0, `${child} 必须在删除清单里`);

    for (const target of targets) {
      const targetIndex = dropStatements.indexOf(target);
      // 指向存活表（如 videos）的外键随子表一起消失，不需要排序
      if (targetIndex === -1) continue;
      assert.ok(childIndex < targetIndex, `${child} 必须先于 ${target} 删除`);
    }
  }

  // 基表必须是最后一张被删的表（它被清单内的子表引用）
  const referenced = new Set([...foreignKeyTargets.values()].flat());
  const lastDropped = dropStatements[dropStatements.length - 1];
  assert.ok(referenced.has(lastDropped), "最后被删的表应当是被子表引用的父表");
});

test("本迁移不摘任何函数（实测函数不阻塞删表，函数清理属另一件事）", () => {
  // 反证重放路径已证明：引号体形式的 SQL 函数不会在创建时登记 pg_depend 依赖，
  // 因此"必须先删函数"不成立。家族函数的清理需另立施工单。
  assert.doesNotMatch(
    executable,
    /DROP FUNCTION/,
    "不得顺手删除任何函数：家族函数清理属另一件事，需另立施工单",
  );
  assert.doesNotMatch(
    executable,
    /case_library/,
    "case_library_* 在线上现役且有调用记录，属 B2-2 观察范围，本迁移不得连带",
  );
});

test("建表迁移必须排在本迁移之前（避免空库重放删完又把它造回来）", () => {
  const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));

  for (const table of dropStatements) {
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

test("回滚 recipe 点名真实存在的建表来源迁移，并覆盖每张被删表", () => {
  const rollbackStart = migrationSql.indexOf("-- ROLLBACK");
  assert.ok(rollbackStart >= 0, "必须有 ROLLBACK 段落");
  const rollbackSection = migrationSql.slice(rollbackStart);

  const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
  const files = readdirSync(migrationsDir);
  const referenced = Array.from(rollbackSection.matchAll(/(\d+_[a-z_]+\.sql)/g)).map((m) => m[1]);
  assert.ok(referenced.length >= 2, "回滚 recipe 必须点名建表来源迁移（含仅补建基表的那一个）");
  for (const name of referenced) {
    assert.ok(files.includes(name), `${name} 必须是真实存在的迁移文件`);
  }
  for (const table of dropStatements) {
    assert.match(rollbackSection, new RegExp(table), `回滚 recipe 必须覆盖 ${table}`);
  }
  assert.match(rollbackSection, /0 行/, "必须写明删除前数据行数（线上实测合计 0 行）");
});

test("迁移只允许 DROP 已授权对象，不得夹带其它写操作", () => {
  const statements = executable
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  assert.equal(
    statements.length,
    dropStatements.length,
    `本迁移应只有 ${dropStatements.length} 条删表语句，不得夹带其它写操作`,
  );
  for (const statement of statements) {
    assert.match(
      statement,
      /^DROP TABLE IF EXISTS public\.[a-z_]+$/,
      `发现越界语句：${statement}`,
    );
  }
});
