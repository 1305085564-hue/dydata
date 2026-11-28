import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateTopicWorkSummary } from "./domain";
import { TOPIC_LIBRARY_QUALIFY_PLAY_COUNT } from "./metrics";

test("【结构契约】topics service 达标阈值只引用共享常量，防止 30000 硬编码回潮", () => {
  // 这一条是源码级结构契约，不是行为测试：把 30000 写死与引用共享常量在运行时完全等价，
  // 任何输入/输出断言都区分不出来，删掉它就等于失去防回潮能力。
  // 阈值的行为侧另有覆盖——本文件 calculateTopicWorkSummary 的 29999/30000 边界用例。
  // B02 领域/数据锚点：阈值常量已随拆分迁入三处，断言内容保持不变。
  const source = [
    readFileSync(resolve(process.cwd(), "src/lib/topics/domain/ranking.ts"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/lib/topics/domain/query-options.ts"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/lib/topics/data/pool-scored.ts"), "utf8"),
  ].join("\n");
  assert.equal(TOPIC_LIBRARY_QUALIFY_PLAY_COUNT, 30_000);
  assert.doesNotMatch(source, />=\s*30_000/);
  assert.doesNotMatch(source, />=\s*30000/);
  assert.match(source, /TOPIC_LIBRARY_QUALIFY_PLAY_COUNT/);

  // 行为侧锁定：达标判定确实以共享常量为界（差 1 条不达标、恰好达标计 1 条）。
  const below = calculateTopicWorkSummary([
    { playCount: 29999, content: "差 1 条", uploadedAt: "2026-07-01T00:00:00.000Z" },
  ]);
  const at = calculateTopicWorkSummary([
    { playCount: 30000, content: "恰好达标", uploadedAt: "2026-07-01T00:00:00.000Z" },
  ]);
  assert.equal(below.qualifiedWorkCount, 0);
  assert.equal(at.qualifiedWorkCount, 1);
});
