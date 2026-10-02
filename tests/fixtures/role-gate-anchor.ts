import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type RoleGateAnchor = {
  baseDate: string;
  year: number;
  month: number;
  reportDates: [string, string];
};

/**
 * 发布日历断言的唯一时间基准：由 `scripts/seed-roles-test-data.ts` 每次跑门禁时
 * 重算并落盘到 `output/gate-roles-anchor.json`（gitignored），用例只消费、不自己猜月份。
 *
 * 存在的理由：用例早期用「跑测试时的时钟」推月份，在凌晨 00:00–08:00 窗口会与
 * 后端算出的上海月份、以及数据库 current_date（UTC）三方错位，整月被判为未来而返回
 * 空表 —— 那是假红，不是系统坏了。锚点缺文件时直接失败，避免静默退化回旧行为。
 */
export function readRoleGateAnchor(): RoleGateAnchor {
  const path = resolve(process.cwd(), "output/gate-roles-anchor.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`缺少 ${path}：请先跑 npm run seed:roles 生成时间锚点，再跑角色/浏览器门禁`);
  }
  const parsed = JSON.parse(raw) as Partial<RoleGateAnchor>;
  if (
    !Number.isFinite(parsed.year)
    || !Number.isFinite(parsed.month)
    || !Array.isArray(parsed.reportDates)
    || parsed.reportDates.length !== 2
  ) {
    throw new Error(`${path} 内容不完整，请重跑 npm run seed:roles`);
  }
  return parsed as RoleGateAnchor;
}
