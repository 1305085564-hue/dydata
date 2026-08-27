import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-panel-v2.tsx"),
  "utf8",
);
const exemptionSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/申请豁免弹窗.tsx"),
  "utf8",
);
const serifClass = ["font", "serif"].join("-");

test("首页今日提交恢复 Claude 人文工作台文案与视觉结构", () => {
  assert.match(source, /创作立卷 · 表达纪事/);
  assert.match(source, /从容记录每一次真实表达 · 数据沉淀与成长复盘/);
  assert.match(source, /rounded-2xl border border-\[#ECE7DE\] bg-gradient-to-br/);
  assert.match(source, new RegExp(`${serifClass} text-2xl font-semibold`));
  assert.match(source, /停笔调养/);
  assert.match(source, /历史手稿/);
  assert.match(source, /历史手稿静待立卷/);
  assert.match(source, /完成创作立卷或补交后，这里将收录最近 30 份纪事手稿。/);
  assert.match(exemptionSource, /停笔调养 · 申请请假或豁免/);
  assert.doesNotMatch(source, /今日提交工作台/);
  assert.doesNotMatch(source, /记录运营数据，提交今日内容/);
  assert.doesNotMatch(source, /申请豁免按钮/);
  assert.doesNotMatch(
    exemptionSource,
    />\s*申请请假或豁免\s*<\/DialogTitle>/,
  );
  assert.doesNotMatch(exemptionSource, new RegExp(serifClass));
});
