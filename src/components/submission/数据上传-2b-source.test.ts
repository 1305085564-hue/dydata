import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("截图槽位底栏优先展示 OCR 具体失败原因，并把错误放入 title", () => {
  const source = readSource("src/components/submission/截图槽位区.tsx");

  assert.match(source, /title=\{slot\.error \?\? undefined\}/);
  assert.match(source, /slot\.error \|\| "未识别到图片内容，请点击重新上传"/);
  assert.match(source, /slot\.error \? \(/);
  assert.match(source, /\{slot\.error\} · 请核对右侧指标/);
});

test("截图槽位空卡片和操作按钮具备键盘与无障碍标识", () => {
  const source = readSource("src/components/submission/截图槽位区.tsx");

  assert.match(source, /role=\{slot\.status === "empty" \? "button" : undefined\}/);
  assert.match(source, /tabIndex=\{slot\.status === "empty" \? 0 : undefined\}/);
  assert.match(source, /aria-label=\{slot\.status === "empty" \? `\$\{item\.title\}截图，点击选择文件` : undefined\}/);
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
