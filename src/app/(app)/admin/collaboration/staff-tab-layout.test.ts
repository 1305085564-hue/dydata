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
  assert.match(talentSource, /focus-visible:ring-\[#D97757\]/);
});

test("文案绩效条数展示核算明细，未认证时不显示明细", () => {
  assert.match(source, /绩效条数核算明细/);
  assert.match(source, /计费基数（播放≥500）/);
  assert.match(source, /优秀作品加成/);
  assert.match(source, /最终计费条数/);
  assert.match(source, /未认证成员不计费/);
  assert.doesNotMatch(source, /月度基准扣除/);
});

test("文案作品缺失播放时显示无数据且不进入未达标差额分支", () => {
  assert.match(source, /无数据·不计/);
  assert.doesNotMatch(source, /const play = work\.playCount \?\? 0/);
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
  assert.doesNotMatch(talentSource, /爆款作品/);
  assert.match(talentSource, /转粉率/);
  assert.match(talentSource, /互动率/);
  assert.doesNotMatch(operatorSource, /爆款数/);
  assert.doesNotMatch(operatorSource, /导粉\s*\{sort/);
  assert.match(operatorSource, /<th[^>]*>\s*导粉\s*<\/th>/);
  assert.match(operatorSource, /转粉率/);
  assert.match(operatorSource, /互动率/);
  assert.match(source, /const countLabel = "本月篇数"/);
  assert.match(source, /转粉率/);
  assert.match(source, /互动率/);
  assert.match(source, /绩效条数/);
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
  // 运营：展开+姓名+负责账号+本月作品+总播放+条均+有效+优秀+环比+转粉+互动 = 11
  assert.match(operatorSource, /colSpan=\{11\}/);
  // 文案：8 基础列（移除了最近作品列） + 绩效 + 认证 + 转粉 + 互动 + 互动达成 + 核心达成 + 综合良优率 = 15；剪辑不加率为 8
  assert.match(source, /colSpan=\{role === "writer" \? 15 : 8\}/);
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

test("岗位表格采用阿禅指定的紧凑目标列宽（文案 1335px / 剪辑 710px），3字列/4字列规整化且有效优秀作品带箭头", () => {
  assert.match(source, /writer:\s*"min-w-\[1335px\]"/);
  assert.match(source, /editor:\s*"min-w-\[710px\]"/);
  // 列名精简断言
  assert.match(source, /条均播/);
  assert.match(source, /绩效条/);
  assert.match(source, /良优率/);
  // 有效作品与优秀作品带排序能力
  assert.match(source, /onClick=\{\(\) => sort\.onSort\("effectiveCount"\)\}/);
  assert.match(source, /onClick=\{\(\) => sort\.onSort\("excellentCount"\)\}/);
  // 列宽断言
  assert.match(source, /<col className="w-\[90px\]" \/>/);  // 姓名90px / 4字列90px
  assert.match(source, /<col className="w-\[150px\]" \/>/); // 负责账号150px
  assert.match(source, /<col className="w-\[80px\]" \/>/);  // 3字列80px
  assert.match(source, /<col className="w-\[75px\]" \/>/);  // 良优率75px
  assert.match(source, /<col className="w-\[130px\]" \/>/); // 认证状态130px
});




