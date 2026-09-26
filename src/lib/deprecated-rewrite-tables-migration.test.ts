import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const unifiedViewSql = readFileSync(
  new URL("../../supabase/migrations/062_ai_rewrite_unified_view.sql", import.meta.url),
  "utf8",
);
const skillsAndDocumentsSql = readFileSync(
  new URL("../../supabase/migrations/20260629000000_rewrite_skills_and_documents.sql", import.meta.url),
  "utf8",
);
const deprecatedCleanupSql = readFileSync(
  new URL("../../supabase/migrations/20260926130000_drop_deprecated_rewrite_tables.sql", import.meta.url),
  "utf8",
);

/** 去掉 -- 注释行，只保留可执行 SQL：注释里说明历史时提到表名不算"引用"。 */
function executableSql(source: string) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

// 待删表名从新迁移的 FOREACH ARRAY 推导，避免在测试里再写一遍表名（保持 src/ 对三张表 grep 干净）
const droppedTables = (() => {
  const list = deprecatedCleanupSql.match(/FOREACH\s+target\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]/i);
  assert.ok(list, "必须能从 FOREACH ARRAY 取到待清理表清单");
  return Array.from(list[1].matchAll(/'([a-z_]+)'/g)).map((match) => match[1]);
})();

function viewDefinition(source: string) {
  const start = source.toLowerCase().indexOf("create or replace view public.ai_unified_config_view as");
  const end = source.toLowerCase().indexOf("grant select on public.ai_unified_config_view");
  assert.ok(start >= 0 && end > start, "必须能找到 ai_unified_config_view 的定义段与随后的 GRANT");
  return source.slice(start, end).toLowerCase().replace(/\s+/g, " ").trim();
}

function configTypes(source: string) {
  return Array.from(source.matchAll(/'([a-z_]+)'::text as config_type/gi)).map((match) => match[1]).sort();
}

test("待清理的废弃表清单可从迁移里推导，且清单内不重复", () => {
  assert.ok(droppedTables.length >= 3, "至少要清掉被视图/外键引用的那几张废弃表");
  assert.equal(new Set(droppedTables).size, droppedTables.length, "清单不得重复");
});

test("051 版本号已正名：线上真正应用的组长日报迁移回到 051，占号的清理文件已删除", () => {
  const files = readdirSync(new URL("../../supabase/migrations/", import.meta.url));

  assert.ok(
    files.includes("051_leader_daily_reports.sql"),
    "线上 ledger 的 051 是组长日报表，本地必须以同名文件实名存在，否则本地与线上对不上",
  );
  assert.ok(
    !files.includes("051_cleanup_deprecated_tables.sql"),
    "占用 051 号、却在线上从未生效的清理文件必须删除（清理内容由本迁移承担）",
  );

  const illegalNames = files.filter((name) => name.endsWith(".sql") && !/^\d+_/.test(name));
  assert.deepEqual(illegalNames, [], "迁移文件名必须满足 CLI 的 <数字版本>_name.sql，否则会被静默跳过");
});

test("不会有迁移在删表之后再重建这些废弃表（空库与线上保持同一终态）", () => {
  const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const thisMigration = "20260926130000_drop_deprecated_rewrite_tables.sql";

  for (const table of droppedTables) {
    const creators = files.filter((name) =>
      readFileSync(new URL(name, migrationsDir), "utf8").includes(`create table if not exists public.${table}`),
    );
    for (const creator of creators) {
      assert.ok(creator < thisMigration, `${creator} 创建 ${table} 必须排在删表迁移之前，否则空库重放会重建它`);
    }
    if (creators.length === 0) {
      assert.match(
        deprecatedCleanupSql,
        new RegExp(table),
        `${table} 已无任何建表迁移（线上才有的历史表），必须在本迁移里说明`,
      );
    }
  }
});

test("删表顺序满足策略依赖：被跨表 RLS 策略引用的表必须后删", () => {
  // 迁移注释里按 `<引用方>.<列表>.workflow_id → <被引用表>` 记录了线上实测的外键依赖；
  // 该外键所在表上的 RLS 策略会引用被引用表，故被引用表必须后删。
  const dependency = deprecatedCleanupSql.match(/([a-z_]+)\.workflow_id\s+→\s+([a-z_]+)/);
  assert.ok(dependency, "迁移必须记录 workflow_id 这条外键依赖");
  const [, referencingTable, referencedTable] = dependency;

  const order = deprecatedCleanupSql.match(/FOREACH\s+target\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]/i);
  assert.ok(order, "必须能从 FOREACH ARRAY 取到删表顺序");
  const sequence = Array.from(order[1].matchAll(/'([a-z_]+)'/g)).map((match) => match[1]);

  assert.ok(
    sequence.indexOf(referencingTable) < sequence.indexOf(referencedTable),
    `${referencingTable}（带引用策略）必须排在 ${referencedTable} 之前`,
  );
});

test("062 的可执行 SQL 不再引用被删除的废弃表（空库重放不再报 relation does not exist）", () => {
  const viewSql = executableSql(unifiedViewSql);
  for (const table of droppedTables) {
    assert.doesNotMatch(viewSql, new RegExp(table), `062 仍引用 ${table}`);
  }
  assert.doesNotMatch(viewSql, /length_preset_id/);
});

test("062 只删废弃分支，保留存活分支、GRANT 与 rollback 注释", () => {
  assert.deepEqual(configTypes(unifiedViewSql), ["feature", "rewrite_mode", "rewrite_model_view"]);
  assert.match(unifiedViewSql, /GRANT SELECT ON public\.ai_unified_config_view TO authenticated, service_role;/);
  assert.match(unifiedViewSql, /-- rollback: DROP VIEW public\.ai_unified_config_view;/);
});

test("20260629000000 的可执行 SQL 不再从已删表读数据（不伪造空数据搬运）", () => {
  const skillsSql = executableSql(skillsAndDocumentsSql);
  for (const table of droppedTables) {
    assert.doesNotMatch(skillsSql, new RegExp(table), `20260629000000 仍从 ${table} 读取`);
  }
  assert.doesNotMatch(skillsSql, /fm\.fixed_prompt/);
});

test("补录的前向迁移顺序正确：重建视图 → 摘外键 → 删表（不用 CASCADE）", () => {
  const executable = executableSql(deprecatedCleanupSql);
  const viewIndex = executable.toLowerCase().indexOf("create or replace view public.ai_unified_config_view as");
  const grantIndex = executable.indexOf("GRANT SELECT ON public.ai_unified_config_view");
  const foreignKeyIndex = executable.indexOf("pg_constraint");
  const dropIndex = executable.indexOf("DROP TABLE public.%I");

  assert.ok(viewIndex >= 0, "前向迁移必须重建视图");
  assert.ok(grantIndex > viewIndex, "重建后必须保留 GRANT");
  assert.ok(foreignKeyIndex > viewIndex, "摘外键必须排在重建视图之后");
  assert.ok(dropIndex > foreignKeyIndex, "删表必须排在摘外键之后");
  assert.doesNotMatch(executable, /cascade/i, "不得用 CASCADE（会静默删掉视图）");
  assert.match(
    executable,
    /to_regclass\('public\.' \|\| target\) IS NULL/,
    "必须有无表则跳过的守卫，保证空库重放时整体是 no-op",
  );
});

test("前向迁移与 062 的视图定义保持一致（改一处必须同步另一处）", () => {
  assert.equal(viewDefinition(deprecatedCleanupSql), viewDefinition(unifiedViewSql));
  assert.deepEqual(configTypes(deprecatedCleanupSql), ["feature", "rewrite_mode", "rewrite_model_view"]);
});

test("前向迁移留了回滚 recipe：表定义来源 + 删除前数据快照（空表须明确标注）", () => {
  const rollbackStart = deprecatedCleanupSql.indexOf("-- ROLLBACK");
  assert.ok(rollbackStart >= 0, "必须有 ROLLBACK 段落");
  const rollbackSection = deprecatedCleanupSql.slice(rollbackStart);

  // 只在回滚段落里找"建表来源迁移"，避免把文件头部的历史说明也算进来
  const migrationFiles = readdirSync(new URL("../../supabase/migrations/", import.meta.url));
  const referencedMigrations = Array.from(
    rollbackSection.matchAll(/(\d+_[a-z_]+\.sql)/g),
  ).map((match) => match[1]);
  assert.ok(referencedMigrations.length >= 3, "回滚 recipe 必须点名各表的建表来源迁移");
  for (const name of referencedMigrations) {
    assert.ok(migrationFiles.includes(name), `${name} 必须是真实存在的迁移文件`);
  }

  const seededTables = Array.from(
    deprecatedCleanupSql.matchAll(/^--\s*insert into public\.([a-z_]+)/gm),
  ).map((match) => match[1]);

  for (const table of droppedTables) {
    assert.match(
      rollbackSection,
      new RegExp(table),
      `回滚 recipe 必须覆盖 ${table}（回灌快照，或明确标注为删除前 0 行）`,
    );
  }
  assert.ok(
    seededTables.length >= droppedTables.length - 1,
    "除明确标注空表的之外，其余被删表都要有可执行的回灌语句",
  );
});

test("20260629000000 不再重建任何被删的废弃表（避免空库重放把表造回来）", () => {
  const skillsSql = executableSql(skillsAndDocumentsSql);
  for (const table of droppedTables) {
    assert.doesNotMatch(skillsSql, new RegExp(table), `20260629000000 仍会创建/引用 ${table}`);
  }
  assert.doesNotMatch(skillsSql, /rewrite_variants/);
});
