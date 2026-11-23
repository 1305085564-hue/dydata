import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("截图状态行优先展示 OCR 具体失败原因，并把错误放入 title", () => {
  const source = readSource("src/components/submission/截图槽位区.tsx");
  assert.match(source, /title=\{slot\.error \?\? undefined\}/);
  assert.match(source, /slot\.error \|\| "未识别到图片内容，请点击重新上传"/);
  assert.match(source, /`\$\{slot\.error\} · 请核对下方数字`/);
  assert.match(source, /`\$\{slot\.error\} · 数字请手填`/);
});

test("截图按顺序归位：两张没齐时是粘贴区、提示下一张传什么，齐了换成固定高度的卡片", () => {
  const source = readSource("src/components/submission/截图槽位区.tsx");
  assert.match(source, /className="flex h-\[136px\] flex-col"/, "截图区整块高度固定，切换状态时下方不位移");
  assert.match(source, /aria-label="粘贴或选择截图"/);
  assert.match(source, /"把互动截图粘贴或拖进来"/);
  assert.match(source, /"一次传两张时，请按互动、留存的顺序上传"/);
  assert.match(source, /"请再上传留存截图"/);
  assert.match(source, /"互动截图已收到"/);
  // 提示语只看槽位有没有图，不等识别
  assert.match(source, /const dataReceived = slots\.screenshot_1\.status !== "empty";/);
  // 「猜类型」整套退役：不再有类型确认按钮和溢出计数
  assert.doesNotMatch(source, /这是互动|这是完播|没认出类型|张在识别|按内容/);
  // 删除、重传平时隐藏，悬停或聚焦时浮现
  assert.match(source, /sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100/);
});

test("截图空行和操作按钮具备键盘与无障碍标识", () => {
  const source = readSource("src/components/submission/截图槽位区.tsx");
  // 有图的卡片也可点：点空白处换这一张
  assert.match(source, /role="button"\s+tabIndex=\{0\}/);
  assert.match(source, /aria-label=\{isEmpty \? `\$\{item\.title\}截图，点击选择文件` : `\$\{item\.title\}截图，点击换一张`\}/);
  assert.match(source, /onClick=\{\(\) => slotInputRefs\.current\[item\.role\]\?\.click\(\)\}/);
  assert.match(source, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(source, /aria-label=\{`重新识别\$\{item\.shortTitle\}`\}/);
  assert.match(source, /aria-label=\{`手动填写\$\{item\.shortTitle\}指标`\}/);
  assert.match(source, /aria-label=\{`删除\$\{item\.shortTitle\}`\}/);
  assert.match(source, /aria-live="polite"/);
});

test("指标输入卡把 Label 和 Input 按字段 key 绑定", () => {
  const source = readSource("src/components/submission/指标输入卡.tsx");

  assert.match(source, /<Label[\s\S]*htmlFor=\{`metric-\$\{field\.key\}`\}/);
  assert.match(source, /<Input[\s\S]*id=\{`metric-\$\{field\.key\}`\}/);
});
