import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { DEFAULT_SORT_DIR } from "@/lib/content/domain/content-list";
import {
  buildAccountDisplayLabels,
  filterAccountsByName,
  parseContentListSort,
  writeContentListSort,
} from "./content-list-filters";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("表头暴露 aria-sort：读屏与键盘用户能知道当前按哪列、升序还是降序（审计 M4）", () => {
  const header = read("src/app/(app)/admin/content/content-list-table-header.tsx");

  // 此前排序状态只由 ▼/▲/↕ 表达，未排序列的 ↕ 还是 opacity-0 只有 hover 才显形
  assert.match(header, /aria-sort=\{ariaSortFor\(/, "表头缺少 aria-sort");
  assert.match(header, /"ascending"/, "缺少升序状态");
  assert.match(header, /"descending"/, "缺少降序状态");
  assert.match(header, /aria-label=\{/, "排序按钮缺少可读名称");

  // 所有可排序列都要覆盖，不能只给个别列加
  const ariaSortCount = (header.match(/aria-sort=\{ariaSortFor\(/g) ?? []).length;
  const sortableCount = (header.match(/handleSort\("/g) ?? []).length;
  assert.equal(ariaSortCount, sortableCount, `可排序 ${sortableCount} 列，只有 ${ariaSortCount} 列标了 aria-sort`);
  assert.ok(sortableCount >= 14, `可排序列数量异常：${sortableCount}`);
});

test("排序进 URL：深链/刷新/分享后排序不变（审计 M1）", () => {
  // 非法入参安全回落默认，不抛错、不打坏默认视图
  assert.deepEqual(parseContentListSort(new URLSearchParams("")), {
    sortField: "published_at",
    sortDir: DEFAULT_SORT_DIR.published_at,
  });
  assert.deepEqual(parseContentListSort(new URLSearchParams("sort=不存在")), {
    sortField: "published_at",
    sortDir: "desc",
  });
  // 只有字段没方向时，按该列语义默认方向补齐
  assert.deepEqual(parseContentListSort(new URLSearchParams("sort=interaction_rate")), {
    sortField: "interaction_rate",
    sortDir: DEFAULT_SORT_DIR.interaction_rate,
  });
  // 完整深链原样恢复——这正是审计里「?sort=interaction_rate&dir=asc 不生效」的场景
  assert.deepEqual(parseContentListSort(new URLSearchParams("anomaly=1&sort=interaction_rate&dir=asc")), {
    sortField: "interaction_rate",
    sortDir: "asc",
  });
});

test("默认排序不写进 URL，显式排序写入且可被解析回来", () => {
  const withDefault = writeContentListSort(new URLSearchParams("anomaly=1"), {
    sortField: "published_at",
    sortDir: DEFAULT_SORT_DIR.published_at,
  });
  assert.equal(withDefault.toString(), "anomaly=1");

  const written = writeContentListSort(new URLSearchParams("anomaly=1"), {
    sortField: "interaction_rate",
    sortDir: "asc",
  });
  assert.equal(written.get("sort"), "interaction_rate");
  assert.equal(written.get("dir"), "asc");
  // 其余筛选参数不能被排序写入挤掉
  assert.equal(written.get("anomaly"), "1");
  assert.deepEqual(parseContentListSort(written), { sortField: "interaction_rate", sortDir: "asc" });

  // 切回默认要把参数清干净，避免地址栏留下无用尾巴
  const back = writeContentListSort(written, {
    sortField: "published_at",
    sortDir: DEFAULT_SORT_DIR.published_at,
  });
  assert.equal(back.has("sort"), false);
  assert.equal(back.has("dir"), false);
});

test("账号下拉：同名账号可区分、不重名不加噪音（审计 M5）", () => {
  const labels = buildAccountDisplayLabels([
    { id: "a1", name: "罗礼杰" },
    { id: "a2", name: "小芸姐" },
    { id: "a3", name: "罗礼杰" },
  ]);

  // 不重名保持原样
  assert.equal(labels.get("a2"), "小芸姐");
  // 重名追加序号，用户能确认选的是哪一个
  assert.equal(labels.get("a1"), "罗礼杰（同名 1/2）");
  assert.equal(labels.get("a3"), "罗礼杰（同名 2/2）");
});

test("账号下拉搜索按名称过滤，空关键词返回全部（审计 M5）", () => {
  const accounts = [
    { id: "a1", name: "罗礼杰" },
    { id: "a2", name: "小芸姐" },
  ];
  assert.equal(filterAccountsByName(accounts, "").length, 2);
  assert.deepEqual(filterAccountsByName(accounts, "小芸").map((a) => a.id), ["a2"]);
  assert.equal(filterAccountsByName(accounts, "  ").length, 2);
  assert.equal(filterAccountsByName(accounts, "不存在").length, 0);
});
