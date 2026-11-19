import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./staff-tab.tsx", import.meta.url), "utf8");

test("岗位表格主表移除最近作品列，作品明细在展开行内保证标题截断", () => {
  assert.match(source, /<Table className=\{`[^`]*table-fixed/);
  assert.doesNotMatch(source, /<TableHead[^>]*>最近作品<\/TableHead>/);
  assert.match(
    source,
    /<table className="[^"]*table-fixed[^"]*">[\s\S]*?<CollaborationWorkReviewLink[\s\S]*?className="[^"]*truncate[^"]*"/,
  );
});

test("达人表支持键盘聚焦与焦点环", () => {
  const talentSource = readFileSync(new URL("./talent-tab.tsx", import.meta.url), "utf8");
  assert.match(talentSource, /tabIndex=\{0\}/);
  assert.match(talentSource, /role="button"/);
  assert.match(talentSource, /aria-label=\{`查看\$\{row\.name\}的个人档案`\}/);
  assert.match(talentSource, /focus-visible:ring-\[#141413\]/);
});

test("文案表只给出优条数，不再展示按条数计费的核算明细", () => {
  assert.match(source, /优条数/);
  assert.match(source, /ExcellentCountCell/);
  assert.doesNotMatch(source, /绩效条数核算明细/);
  assert.doesNotMatch(source, /计费基数/);
  assert.doesNotMatch(source, /计费对账/);
  assert.doesNotMatch(source, /billingCount/);
  assert.doesNotMatch(source, /有效作品|优秀作品/);
});

test("文案认证取消改为确认弹窗并清理旧的定时器逻辑", () => {
  const writerBtnSource = readFileSync(new URL("./writer-certification-button.tsx", import.meta.url), "utf8");
  assert.match(writerBtnSource, /取消文案认证/);
  assert.match(writerBtnSource, /保持认证/);
  assert.match(writerBtnSource, /确认取消/);
  assert.match(writerBtnSource, /clearPersonDataCache\(userId\)/);
  assert.doesNotMatch(writerBtnSource, /confirmingCancel/);
  assert.doesNotMatch(writerBtnSource, /resetTimerRef/);
});

test("岗位四个 Tab 的列名按锁定方案展示，运营展开行仍保留账号级导粉", () => {
  const talentSource = readFileSync(new URL("./talent-tab.tsx", import.meta.url), "utf8");
  const operatorSource = readFileSync(new URL("./operator-tab.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(talentSource, /爆款作品|有效作品|优秀作品|独立完成/);
  assert.match(talentSource, /转粉率/);
  assert.match(talentSource, /互动率/);
  assert.doesNotMatch(operatorSource, /爆款数|有效作品|优秀作品|环比/);
  assert.doesNotMatch(operatorSource, /导粉\s*\{sort/);
  assert.match(operatorSource, /<th[^>]*>\s*导粉\s*<\/th>/);
  assert.match(operatorSource, /转粉率/);
  assert.match(operatorSource, /互动率/);
  assert.match(source, /const countLabel = "本月篇数"/);
  assert.match(source, /转粉率/);
  assert.match(source, /互动率/);
  assert.match(source, /优条数/);
  assert.match(source, /认证状态/);
  assert.doesNotMatch(source, /本月条数/);
  assert.match(source, /转粉率/);
  assert.match(source, /互动率/);
});

test("岗位表格脚注明确日报产量与快照比率口径不同", () => {
  assert.match(source, /篇数按日报统计；转粉率、互动率按作品最新 24h 快照加总后计算/);
});

test("展开行 colSpan 与新增比率列后的表头列数对齐", () => {
  const operatorSource = readFileSync(new URL("./operator-tab.tsx", import.meta.url), "utf8");
  // 运营：展开+姓名+负责账号+本月作品+总播放+条均+转粉+互动 = 8
  assert.match(operatorSource, /colSpan=\{8\}/);
  // 文案：6 基础列（展开+姓名+账号+总播放+条均+篇数） + 优条数 + 认证 + 转粉 + 互动 + 互动达成 + 核心达成 + 综合良优率 = 13；剪辑只有 6 基础列
  assert.match(source, /colSpan=\{role === "writer" \? 13 : 6\}/);
  assert.doesNotMatch(source, /colSpan=\{role === "writer" \? 15 : 8\}/);
  assert.doesNotMatch(source, /colSpan=\{role === "writer" \? 16 : 9\}/);
  assert.doesNotMatch(source, /colSpan=\{role === "writer" \? 13 : 9\}/);
  assert.doesNotMatch(source, /colSpan=\{role === "writer" \? 11 : 9\}/);
});

test("岗位表格已移除主表最近作品列，作品明细下沉至展开行，行高控制在 ~36px 单行", () => {
  assert.doesNotMatch(source, /<TableHead[^>]*>最近作品<\/TableHead>/);
  // 展开按钮尺寸控制在 size-6，单元格 py-2 维持 ~36px 单行高度
  assert.match(source, /flex size-6 items-center justify-center/);
  assert.match(source, /TableCell className="w-10 px-2 py-2 sticky/);
});

test("岗位表格采用自适应文本列宽（min-w-[90px] w-auto）与紧凑总宽，减少笔记本横向滚动", () => {
  assert.match(source, /writer:\s*"min-w-\[1080px\]"/);
  assert.match(source, /editor:\s*"min-w-\[500px\]"/);
  // 列名精简断言
  assert.match(source, /条均播/);
  assert.match(source, /优条数/);
  assert.match(source, /留存达成/);
  // 优条数带排序能力
  assert.match(source, /onClick=\{\(\) => sort\.onSort\("excellentCount"\)\}/);
  // 文本列 min-w w-auto 自适应 + 数字列规整（writer 收紧数字列给良优率与认证状态留足宽度，editor 保持不变）
  assert.match(source, /<col className="min-w-\[90px\] w-auto" \/>/);
  assert.match(source, /<col className="min-w-\[104px\] w-auto" \/>/);
  assert.match(source, /<col className="w-\[76px\]" \/>/);
  assert.match(source, /<col className="w-\[74px\]" \/>/);
  assert.match(source, /<col className="w-\[86px\]" \/>/);
  assert.match(source, /<col className="w-\[126px\]" \/>/);
  assert.match(source, /<col className="min-w-\[120px\] w-auto" \/>/);
  assert.match(source, /<col className="w-\[80px\]" \/>/);
  assert.match(source, /<col className="w-\[82px\]" \/>/);
});

test("达人与运营表格统一落地自适应文本列宽、colgroup与py-2单行高度标准", () => {
  const talentSource = readFileSync(new URL("./talent-tab.tsx", import.meta.url), "utf8");
  const operatorSource = readFileSync(new URL("./operator-tab.tsx", import.meta.url), "utf8");

  // 达人表规范断言
  assert.match(talentSource, /TALENT_TABLE_MIN_WIDTH\s*=\s*"min-w-\[950px\]"/);
  assert.match(talentSource, /<col className="min-w-\[90px\] w-auto" \/>/);
  assert.match(talentSource, /<Table className=\{`\$\{TALENT_TABLE_MIN_WIDTH\} table-fixed`\}>/);
  assert.match(talentSource, /<TalentTableColGroup \/>/);
  assert.match(talentSource, /sticky left-0/);

  // 运营表规范断言
  assert.match(operatorSource, /OPERATOR_TABLE_MIN_WIDTH\s*=\s*"min-w-\[600px\]"/);
  assert.match(operatorSource, /<col className="min-w-\[90px\] w-auto" \/>/);
  assert.match(operatorSource, /<Table className=\{`\$\{OPERATOR_TABLE_MIN_WIDTH\} table-fixed`\}>/);
  assert.match(operatorSource, /<OperatorTableColGroup \/>/);
  assert.match(operatorSource, /flex size-6 items-center justify-center/);
  assert.match(operatorSource, /<TableCell className="w-10 px-2 py-2 text-center/);
});
