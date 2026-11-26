import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const source = read("./staff-tab.tsx");
const talentSource = read("./talent-tab.tsx");
const operatorSource = read("./operator-tab.tsx");
const toolbarSource = read("./collaboration-workbench-toolbar.tsx");
const tableSource = read("./role-table.tsx");
const hintsSource = read("./collaboration-quality-hints.tsx");

test("四张岗位表共用一行一人的骨架：整行点开档案，键盘落在名字格的真按钮上，窄屏改列表不横拖", () => {
  for (const tab of [source, talentSource, operatorSource]) {
    assert.match(tab, /<RoleTable/);
    assert.doesNotMatch(tab, /ChevronRight|ExpandedRow|onToggleExpand/, "行首不再有展开箭头，点一行只有一个去处");
  }
  // <tr role="button"> 会让读屏丢掉行与列头的关联，键盘入口改为名字格里的原生按钮
  assert.doesNotMatch(tableSource, /role="button"/);
  assert.match(tableSource, /<button[\s\S]*?aria-label=\{rowAriaLabel \? rowAriaLabel\(row\) : `查看\$\{getName\(row\)\}的个人档案`\}/);
  assert.match(tableSource, /onClick=\{\(\) => onSelectPerson\(userId\)\}/);
  assert.match(tableSource, /<ul className="sm:hidden/);
  assert.match(tableSource, /hidden sm:flex/);
});

test("账号名写在姓名下面一行灰字，不再单独占列", () => {
  assert.doesNotMatch(talentSource, /名下账号<\/TableHead>/);
  assert.doesNotMatch(source, /负责账号<\/TableHead>/);
  assert.match(talentSource, /getSub=\{\(row\) => formatAccountLine/);
  assert.match(source, /getSub=\{\(row\) =>\s*formatAccountLine/);
  assert.match(operatorSource, /`负责 \$\{line\}`/);
});

test("四张表默认按总播放排序", () => {
  for (const tab of [source, talentSource, operatorSource]) {
    assert.match(tab, /defaultSortKey="totalPlay"/);
  }
});

test("文案表只给出优条数，不再展示按条数计费的核算明细", () => {
  assert.match(source, /excellentCountColumn/);
  assert.match(hintsSource, /label: "优条数"/);
  assert.doesNotMatch(source, /绩效条数核算明细|计费基数|计费对账|billingCount/);
  assert.doesNotMatch(source, /有效作品|优秀作品/);
});

test("认证按钮在可点的行里，点击不冒泡成打开档案", () => {
  assert.match(source, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(source, /<WriterCertificationButton/);
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

test("岗位表列名按锁定方案：达人/运营不出爆款、有效、优秀、独立完成、环比", () => {
  assert.doesNotMatch(talentSource, /爆款作品|有效作品|优秀作品|独立完成/);
  assert.doesNotMatch(operatorSource, /爆款数|有效作品|优秀作品|环比/);
  assert.match(talentSource, /rateColumns/);
  assert.match(operatorSource, /rateColumns/);
  assert.match(source, /rateColumns/);
  assert.match(hintsSource, /label: "转粉率"/);
  assert.match(hintsSource, /label: "互动率"/);
  assert.match(hintsSource, /label: "本月作品"/);
});

test("表下不压脚注：日报产量与快照比率的口径收进列头悬停", () => {
  for (const tab of [source, talentSource, operatorSource]) {
    assert.doesNotMatch(tab, /<p className="px-1 text-\[12px\]/);
  }
  assert.match(hintsSource, /reportCount: "按日报统计/);
  assert.match(hintsSource, /未同步数据复盘的作品不参与/);
});

test("文案表、达人表接统一完整/简洁明细列，开关收进顶部工具栏而不在 Tab 内单独占位", () => {
  for (const tab of [source, talentSource]) {
    assert.doesNotMatch(tab, /<DetailToggle/, "Tab 内不再放独立开关行，避免切换页签跳动");
    assert.match(tab, /useCollaborationDetailMode/);
    assert.match(tab, /interactionDetailColumns/);
    assert.match(tab, /retentionDetailColumns/);
  }
  assert.match(toolbarSource, /<DetailToggle/);
  assert.match(hintsSource, /INTERACTION_DETAIL_COLUMNS\.map/);
  assert.match(hintsSource, /RETENTION_DETAIL_COLUMNS\.map/);
  assert.doesNotMatch(operatorSource, /<DetailToggle/);
});

test("运营负责账号明细（含账号级导粉）挪进个人档案", () => {
  const worksSource = read("./personal-card-works.tsx");
  assert.match(worksSource, /<Section title="负责账号">/);
  assert.match(worksSource, /<th className=\{`\$\{headClass\} text-right`\}>导粉<\/th>/);
});
