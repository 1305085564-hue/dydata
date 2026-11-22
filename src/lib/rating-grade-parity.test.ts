import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import {
  DEFAULT_RATING_RULE,
  breakoutRating,
  overallBreakoutGrade,
  type RatingRule,
} from "./breakout-rating";
import { PLAY_BUCKETS } from "./content/domain/content-list-filters";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .reverse();

function latestMigrationContaining(text: string): { name: string; source: string } {
  const name = migrationFiles.find((file) => readFileSync(join(migrationsDir, file), "utf8").includes(text));
  assert.ok(name, `迁移文件写法变了，找不到包含 ${text} 的最新迁移`);
  return { name, source: readFileSync(join(migrationsDir, name), "utf8") };
}

function extractGradeFunction(source: string): string {
  const match = source.match(/create or replace function public\.content_overall_grade_rank[\s\S]*?\$\$;/i);
  assert.ok(match, "迁移文件写法变了，请更新本测试的截取规则");
  return match[0];
}

function dbRankToGrade(rank: number | null): string | null {
  if (rank === null) return null;
  if (rank === 3) return "优";
  if (rank === 2) return "良";
  return "普";
}

async function assertGridMatches(db: PGlite, rule: RatingRule) {
  const playCounts: Array<number | null> = [null, -1, 0, 1, 1999, 2000, 4999, 5000, 14999, 15000, 100000];
  const achievements: Array<number | null> = [null, 0, 59.99, 60, 79.99, 80, 99.99, 100, 250];
  for (const playCount of playCounts) {
    for (const interaction of achievements) {
      for (const retention of achievements) {
        const result = await db.query<{ rank: number | null }>(
          "select public.content_overall_grade_rank($1::numeric, $2::numeric, $3::numeric, $4::jsonb) as rank",
          [playCount, interaction, retention, JSON.stringify(rule)],
        );
        const dbGrade = dbRankToGrade(result.rows[0]?.rank ?? null);
        const appResult = overallBreakoutGrade(playCount, [
              interaction === null ? null : breakoutRating(interaction, 100),
              retention === null ? null : breakoutRating(retention, 100),
        ], rule);
        assert.equal(
          dbGrade,
          appResult,
          `数据库的评级判定和应用不一致：播放 ${playCount ?? "缺失"}、互动 ${interaction ?? "缺失"}、留存 ${retention ?? "缺失"}，数据库判“${dbGrade ?? "不评级"}”，应用判“${appResult ?? "不评级"}”。改评级逻辑必须同步修改 content_overall_grade_rank。`,
        );
      }
    }
  }
}

test("数据库评级函数与应用默认规则逐格一致", async () => {
  const migration = latestMigrationContaining("content_overall_grade_rank");
  const db = new PGlite("memory://");
  try {
    await db.exec(extractGradeFunction(migration.source));
    await assertGridMatches(db, DEFAULT_RATING_RULE);
  } finally {
    await db.close();
  }
});

test("数据库评级函数读取自定义规则，不使用兜底门槛", async () => {
  const migration = latestMigrationContaining("content_overall_grade_rank");
  for (const maxPull of [0, 1, 2]) {
    const db = new PGlite("memory://");
    const rule: RatingRule = {
      playFloor: 3000,
      playGood: 8000,
      playExcellent: 20000,
      excellent: 110,
      good: 85,
      fair: 65,
      maxPull,
    };
    try {
      await db.exec(extractGradeFunction(migration.source));
      await assertGridMatches(db, rule);
    } finally {
      await db.close();
    }
  }
});

test("最新列表迁移只调用评级函数，其他播放分档仍与应用一致", () => {
  const migration = latestMigrationContaining("admin_content_list_page");
  assert.match(migration.source, /content_overall_grade_rank\(/);
  const ratings = migration.source.slice(
    migration.source.indexOf("), ratings as materialized ("),
    migration.source.indexOf("), derived as materialized ("),
  );
  assert.ok(ratings, "迁移文件写法变了，找不到 ratings 段");
  assert.doesNotMatch(ratings, /\b(?:2000|5000|15000)\b/, "ratings 段仍写死评级门槛");

  const playBucketCase = migration.source.match(/case cfg\.filters->>'playBucket'([\s\S]*?)\n\s*else true/);
  assert.ok(playBucketCase, "迁移文件写法变了，找不到播放分档 case");
  for (const bucket of PLAY_BUCKETS) {
    const lower = `when '${bucket.key}' then d.play_count >= ${bucket.min}`;
    const upper = bucket.max === null ? "" : ` and d.play_count < ${bucket.max}`;
    assert.equal(
      (playBucketCase[1].match(new RegExp(`${lower}${upper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g")) ?? []).length,
      1,
      `数据库播放分档 ${bucket.key} 没有逐格复现应用的 ${bucket.min}-${bucket.max ?? "∞"} 区间`,
    );
  }
  const loader = readFileSync(join(process.cwd(), "src/lib/loaders/admin-content-page.ts"), "utf8");
  assert.match(loader, /const PLAY_CHANGE_SURGE_DELTA_MIN = 5_000/);
  assert.match(migration.source, /r\.play_count - prev\.play_count >= 5000/);
});
