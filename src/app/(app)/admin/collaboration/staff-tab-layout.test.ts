import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./staff-tab.tsx", import.meta.url), "utf8");

test("岗位表格把长作品标题限制在作品列内", () => {
  assert.match(source, /<Table className=\{`[^`]*table-fixed/);
  assert.match(
    source,
    /<TableCell className="[^"]*overflow-hidden[^"]*">[\s\S]*?<CollaborationWorkReviewLink[\s\S]*?className="[^"]*truncate[^"]*"/,
  );
  assert.match(
    source,
    /<table className="[^"]*table-fixed[^"]*">[\s\S]*?<CollaborationWorkReviewLink[\s\S]*?className="[^"]*truncate[^"]*"/,
  );
});

test("达人表支持键盘聚焦、焦点环与爆款 tooltip 说明", () => {
  const talentSource = readFileSync(new URL("./talent-tab.tsx", import.meta.url), "utf8");
  assert.match(talentSource, /tabIndex=\{0\}/);
  assert.match(talentSource, /role="button"/);
  assert.match(talentSource, /aria-label=\{`查看\$\{row\.name\}的个人档案`\}/);
  assert.match(talentSource, /focus-visible:ring-\[#D97757\]/);
  assert.match(talentSource, /播放量达到 3 万以上，且至少是该账号前 5 条作品平均播放量的 3 倍/);
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
