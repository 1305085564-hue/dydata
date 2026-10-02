import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts/seed-roles-test-data.ts");
const tsxCliPath = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

type Anchor = { baseDate: string; year: number; month: number; dates: [string, string] };

function anchorAt(isoNow: string): Anchor {
  // 不连库、不需要凭据：--print-anchor 只跑日期算式。
  const out = execFileSync(process.execPath, [tsxCliPath, scriptPath, "--print-anchor"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DYDATA_GATE_ANCHOR_NOW: isoNow },
  });
  return JSON.parse(out.trim()) as Anchor;
}

describe("角色门禁时间锚点", () => {
  it("锚点月与两条取样日都落在基准日内，且同属一个月份", () => {
    for (const iso of ["2026-11-15T02:00:00Z", "2026-12-31T15:59:00Z", "2027-01-01T01:00:00Z"]) {
      const anchor = anchorAt(iso);
      assert.ok(anchor.dates[0] <= anchor.dates[1], `${iso}: 取样日必须递增`);
      assert.ok(anchor.dates[1] <= anchor.baseDate, `${iso}: 取样日不得晚于基准日（晚于数据库 current_date 会被 RPC 裁掉）`);
      assert.equal(`${anchor.year}-${String(anchor.month).padStart(2, "0")}`, anchor.baseDate.slice(0, 7), `${iso}: 锚点月必须就是基准日所在月`);
      assert.equal(anchor.dates[0].slice(0, 7), anchor.baseDate.slice(0, 7), `${iso}: 取样日必须在锚点月内`);
    }
  });

  it("上海跨月凌晨（数据库还在前一天）时，锚点退回上一个整月而不是取到空月份", () => {
    // 2026-10-31T16:30Z = 上海 2026-11-01 00:30；数据库 current_date（UTC）仍是 10-31。
    const anchor = anchorAt("2026-10-31T16:30:00Z");
    assert.equal(anchor.baseDate, "2026-10-31");
    assert.deepEqual([anchor.year, anchor.month], [2026, 10]);
    assert.deepEqual(anchor.dates, ["2026-10-01", "2026-10-02"]);
  });

  it("上海已跨日而 UTC 也跨日时，锚点用上海当天（两者较早者永远不会超过数据库上限）", () => {
    // 2026-11-01T05:00Z = 上海 13:00，两边同为 11-01。
    const anchor = anchorAt("2026-11-01T05:00:00Z");
    assert.equal(anchor.baseDate, "2026-11-01");
    assert.deepEqual(anchor.dates, ["2026-11-01", "2026-11-01"]);
  });
});
