import assert from "node:assert/strict";
import test from "node:test";

import { assertProdWriteAllowed } from "./lib/prod-write-guard.mjs";

const productionUrl = "https://gcrhhxaopomtposmahsw.supabase.co";
const localUrl = "http://127.0.0.1:54321";
const env = (values: Record<string, string | undefined>) => values as NodeJS.ProcessEnv;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

test("本地地址放行", () => {
  assert.doesNotThrow(() => assertProdWriteAllowed(localUrl, "测试写入", env({})));
});

test("生产地址没有当天确认时拒绝", () => {
  assert.throws(
    () => assertProdWriteAllowed(productionUrl, "导入日报", env({})),
    /这个脚本要写正式数据库（动作：导入日报）。确认要写，请在同一条命令前加 DYDATA_PROD_WRITE_CONFIRM=/,
  );
});

test("生产地址带当天确认时放行", () => {
  assert.doesNotThrow(() => assertProdWriteAllowed(productionUrl, "迁移截图", env({ DYDATA_PROD_WRITE_CONFIRM: today })));
});

