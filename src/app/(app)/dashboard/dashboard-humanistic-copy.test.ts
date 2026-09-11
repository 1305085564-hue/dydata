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
  assert.match(source, /rounded-2xl bg-white/);
  assert.match(source, /shadow-card-ring/);
  const bannedColors = [
    ["#E5", "E0D6"],
    ["#FB", "F9F5"],
    ["#F5", "F3EE"],
    ["#EC", "E7DE"],
    ["#FA", "F8F4"],
    ["#D9", "D3C7"],
  ].map((parts) => parts.join(""));

  for (const color of bannedColors) {
    const pattern = new RegExp(color, "i");
    assert.doesNotMatch(source, pattern, `video-submit-panel-v2 不得包含旧色 ${color}`);
    assert.doesNotMatch(exemptionSource, pattern, `申请豁免弹窗 不得包含旧色 ${color}`);
  }
  assert.match(source, new RegExp(`${serifClass} text-2xl (font-semibold|font-\\[580\\])`));
  assert.match(source, /停笔调养/);
  assert.match(source, /历史手稿/);
  assert.match(source, /历史手稿静待立卷/);
  assert.match(source, /完成创作立卷或补交后，这里将收录最近 30 份纪事手稿。/);
  assert.match(exemptionSource, /停笔调养 · 申请请假或(特殊)?豁免/);
  assert.doesNotMatch(source, /今日提交工作台/);
  assert.doesNotMatch(source, /记录运营数据，提交今日内容/);
  assert.doesNotMatch(source, /申请豁免按钮/);
  assert.doesNotMatch(
    exemptionSource,
    />\s*申请请假或(特殊)?豁免\s*<\/DialogTitle>/,
  );
  assert.doesNotMatch(exemptionSource, new RegExp(serifClass));
});

test("创作立卷·表达纪事 恪守双字协同与四立场合排版规格", () => {
  const formSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-form-v2.tsx"),
    "utf8",
  );
  const globalsCss = readFileSync(
    resolve(process.cwd(), "src/app/globals.css"),
    "utf8",
  );

  // 1. Page Hero 郑重立标 (Serif 衬线律)
  assert.match(
    source,
    /font-serif text-2xl font-\[580\] text-\[#1C1917\] tracking-tighter/,
    "页面大标题必须使用 font-serif tracking-tighter text-2xl text-[#1C1917] font-[580]",
  );
  assert.match(
    source,
    /text-\[13px\] text-\[#78716C\] tracking-normal font-sans/,
    "副标题必须使用 text-[13px] text-[#78716C] tracking-normal font-sans",
  );
  assert.match(
    source,
    /<div className="space-y-1\.5">[\s\S]*?创作立卷 · 表达纪事[\s\S]*?从容记录每一次真实表达/,
    "大标题与副标必须保持 space-y-1.5 呼吸间距",
  );

  // 2. 全局衬线字体回退栈严禁混入黑体
  assert.match(
    globalsCss,
    /--font-serif:\s*"Iowan Old Style",\s*Charter,\s*Georgia/,
    "衬线字体回退栈必须优先包含 Iowan Old Style, Charter, Georgia",
  );
  assert.doesNotMatch(
    globalsCss,
    /--font-serif:[^;]*(PingFang|YaHei|sans-serif)/i,
    "衬线字体栈严禁混入黑体",
  );

  // 3. 消除表单内重复粗标，仅保留微型段落标头 (H5 墨度)
  assert.doesNotMatch(
    formSource,
    /今日创作立卷/,
    "表单内严禁出现重复的大粗标「今日创作立卷」",
  );
  assert.match(
    formSource,
    /text-\[13px\] font-medium text-\[#78716C\] font-sans antialiased/,
    "表单微型段落标头必须保持 text-[13px] font-medium text-[#78716C] (H5 墨度)",
  );
});
