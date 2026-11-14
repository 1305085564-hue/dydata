import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildWorkContentQualityFromMetrics } from "@/lib/content-quality";
import {
  BREAKOUT_GRADE_THRESHOLDS,
  type BreakoutGrade,
} from "@/lib/breakout-rating";
import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";

type QueryResult<T> = { rows: T[]; rowCount: number | null };
type PgClient = {
  connect: () => Promise<void>;
  end: () => Promise<void>;
  query: <T = Record<string, unknown>>(text: string, values?: readonly unknown[]) => Promise<QueryResult<T>>;
};

const { Client } = createRequire(import.meta.url)("pg") as {
  Client: new (options: { connectionString: string }) => PgClient;
};

function readLocalEnv() {
  const values: Record<string, string> = {};
  for (const line of readFileSync(".env.ai-test.local", "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function assertClose(label: string, actual: number | null, expected: number | null) {
  if (actual === null || expected === null) {
    assert.equal(actual, expected, `${label} 不一致：${JSON.stringify({ actual, expected })}`);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) <= 1e-6,
    `${label} 不一致：${JSON.stringify({ actual, expected })}`,
  );
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function evaluationTargets(standards: EvaluationStandards) {
  return {
    interactionRate: standards.targets.interactionRate,
    reviewLikeRate: standards.targets.reviewLikeRate,
    dryFavoriteRate: standards.targets.dryFavoriteRate,
    bounceRate2s: standards.bounceRate2s,
    completionRate5s: standards.completionRate5s,
    avgPlayDuration: standards.avgPlayDuration,
    avgPlayRatio: standards.avgPlayRatio,
    completionRate: standards.completionRate,
    retentionWeights: standards.retentionWeights,
  };
}

function baseFilters(standards: EvaluationStandards, qualityGrade?: string) {
  return {
    startDate: "2099-01-01",
    endDate: "2099-01-01",
    evaluationTargets: evaluationTargets(standards),
    ...(qualityGrade ? { qualityGrade } : {}),
  };
}

type Fixture = {
  name: string;
  playCount: number;
  bounceRate2s: number | null;
  completionRate5s: number | null;
  avgPlayDuration: number | null;
  avgPlayRatio: number | null;
  completionRate: number | null;
};

const completeRetention = {
  completionRate5s: DEFAULT_EVALUATION_STANDARDS.completionRate5s.good,
  avgPlayDuration: DEFAULT_EVALUATION_STANDARDS.avgPlayDuration.good,
  avgPlayRatio: DEFAULT_EVALUATION_STANDARDS.avgPlayRatio.good / 100,
  completionRate: DEFAULT_EVALUATION_STANDARDS.completionRate.good,
};

const fixtures: Fixture[] = [
  { name: "bounce-25", playCount: 15000, bounceRate2s: 25, ...completeRetention },
  { name: "bounce-30", playCount: 15000, bounceRate2s: 30, ...completeRetention },
  { name: "bounce-30.01", playCount: 15000, bounceRate2s: 30.01, ...completeRetention },
  { name: "play-1999", playCount: 1999, bounceRate2s: 25, ...completeRetention },
  { name: "play-2000", playCount: 2000, bounceRate2s: 25, ...completeRetention },
  { name: "play-14999", playCount: 14999, bounceRate2s: 25, ...completeRetention },
  { name: "play-15000", playCount: 15000, bounceRate2s: 25, ...completeRetention },
  { name: "missing-avg-ratio", playCount: 15000, bounceRate2s: 25, avgPlayRatio: null, completionRate5s: completeRetention.completionRate5s, avgPlayDuration: completeRetention.avgPlayDuration, completionRate: completeRetention.completionRate },
  { name: "missing-bounce", playCount: 15000, bounceRate2s: null, ...completeRetention },
  { name: "missing-completion-5s", playCount: 15000, bounceRate2s: 25, completionRate5s: null, avgPlayDuration: completeRetention.avgPlayDuration, avgPlayRatio: completeRetention.avgPlayRatio, completionRate: completeRetention.completionRate },
  { name: "missing-duration", playCount: 15000, bounceRate2s: 25, completionRate5s: completeRetention.completionRate5s, avgPlayDuration: null, avgPlayRatio: completeRetention.avgPlayRatio, completionRate: completeRetention.completionRate },
  { name: "missing-completion", playCount: 15000, bounceRate2s: 25, completionRate5s: completeRetention.completionRate5s, avgPlayDuration: completeRetention.avgPlayDuration, avgPlayRatio: completeRetention.avgPlayRatio, completionRate: null },
];

function buildParityProjectionFunction(source: string, functionName: string) {
  const renamed = source.replace(
    "CREATE OR REPLACE FUNCTION public.admin_content_list_page",
    `CREATE OR REPLACE FUNCTION public.${functionName}`,
  );
  const start = renamed.lastIndexOf("\nselect jsonb_build_object(\n  'cursorValid'");
  const endMarker = "\nfrom result_page\ncross join totals\ncross join current_cursor;";
  const end = renamed.lastIndexOf(endMarker);
  assert.ok(start >= 0 && end > start, "无法从本地函数定义提取对账投影");
  const projection = `
select coalesce(jsonb_agg(jsonb_build_object(
  'id', id,
  'interactionAchievement', interaction_achievement,
  'coreAchievement', core_achievement,
  'retentionAchievement', retention_achievement,
  'retentionGrade', case
    when retention_achievement >= ${BREAKOUT_GRADE_THRESHOLDS.excellent} then '优'
    when retention_achievement >= ${BREAKOUT_GRADE_THRESHOLDS.good} then '良'
    when retention_achievement >= ${BREAKOUT_GRADE_THRESHOLDS.fair} then '普'
    when retention_achievement is not null then '劣'
    else null
  end,
  'overallGrade', overall_grade,
  'warnings', jsonb_build_object(
    'bounceRate2s', bounce_warning,
    'completionRate5s', completion_5s_warning,
    'avgPlayDuration', duration_warning,
    'avgPlayRatio', avg_ratio_warning,
    'completionRate', completion_warning
  )
) order by id), '[]'::jsonb)
from derived;`;
  return `${renamed.slice(0, start)}${projection}${renamed.slice(end + endMarker.length)}`;
}

async function invokePage(client: InstanceType<typeof Client>, filters: Record<string, unknown>, visibleUserId: string) {
  const result = await client.query(
    `select public.admin_content_list_page(
      'all', 1, 20, null, 'published_at', 'desc', $1::uuid[], $2::jsonb
    ) as payload`,
    [[visibleUserId], JSON.stringify(filters)],
  );
  return result.rows[0].payload as {
    diagnostics?: { evaluationStandardsVersion?: number };
    videos?: Array<{ id: string }>;
    snapshots?: Array<Record<string, unknown> & { video_id: string }>;
  };
}

test("前后端内容质量评级在本地 RPC 上逐项对账", async () => {
  const env = readLocalEnv();
  const target = new URL(env.SUPABASE_DB_URL ?? "");
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "对账测试拒绝非本地数据库连接");
  assert.equal(target.port, "54322", "对账测试必须连接本地隔离库 54322");

  const client = new Client({ connectionString: target.toString() });
  await client.connect();
  await client.query("begin");
  const temporaryFunctionName = `admin_content_list_page_parity_${randomUUID().replaceAll("-", "")}`;

  try {
    const accountResult = await client.query<{ account_id: string; profile_id: string }>(
      `select a.id as account_id, a.profile_id
       from public.accounts a
       join public.profiles p on p.id = a.profile_id
       where p.membership_status = 'active'
       order by a.id
       limit 1`,
    );
    assert.equal(accountResult.rowCount, 1, "本地对账夹具缺少可用账号");
    const { account_id: accountId, profile_id: profileId } = accountResult.rows[0];

    const functionResult = await client.query<{ definition: string }>(
      `select pg_get_functiondef('public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb)'::regprocedure) as definition`,
    );
    await client.query(buildParityProjectionFunction(functionResult.rows[0].definition, temporaryFunctionName));

    for (const fixture of fixtures) {
      const videoId = randomUUID();
      await client.query(
        `insert into public.videos (id, account_id, user_id, video_title, content, published_at, uploaded_at, anomaly_status, lifecycle_state)
         values ($1, $2, $3, $4, 'parity fixture', '2099-01-01T00:00:00Z', '2099-01-01T00:00:00Z', '正常', 'active')`,
        [videoId, accountId, profileId, fixture.name],
      );
      await client.query(
        `insert into public.video_tags (video_id, tag_dimension, tag_value)
         values ($1, '话题', '复盘')`,
        [videoId],
      );
      await client.query(
        `insert into public.video_metrics_snapshots (
          video_id, snapshot_type, play_count, likes, comments, shares, favorites,
          follower_gain, avg_play_duration, completion_rate, bounce_rate_2s,
         completion_rate_5s, avg_play_ratio, captured_at
        ) values ($1, '24h', $2::bigint, $2::integer, 0, 0, 0, 0, $3, $4, $5, $6, $7, '2099-01-01T00:00:00Z')`,
        [
          videoId,
          fixture.playCount,
          fixture.avgPlayDuration,
          fixture.completionRate,
          fixture.bounceRate2s,
          fixture.completionRate5s,
          fixture.avgPlayRatio,
        ],
      );

      const standards = DEFAULT_EVALUATION_STANDARDS;
      const filters = baseFilters(standards);
      const payload = await invokePage(client, filters, profileId);
      assert.equal(payload.diagnostics?.evaluationStandardsVersion, 2, `${fixture.name} 未使用函数版本 2`);
      assert.deepEqual(payload.videos?.map((video) => video.id), [videoId], `${fixture.name} RPC 未返回唯一夹具作品`);
      const snapshot = payload.snapshots?.find((row) => row.video_id === videoId);
      assert.ok(snapshot, `${fixture.name} RPC 未返回快照`);

      assertClose(`${fixture.name}.bounceRate2s`, nullableNumber(snapshot.bounce_rate_2s), fixture.bounceRate2s);
      assertClose(`${fixture.name}.completionRate5s`, nullableNumber(snapshot.completion_rate_5s), fixture.completionRate5s);
      assertClose(`${fixture.name}.avgPlayDuration`, nullableNumber(snapshot.avg_play_duration), fixture.avgPlayDuration);
      assertClose(`${fixture.name}.avgPlayRatio`, nullableNumber(snapshot.avg_play_ratio), fixture.avgPlayRatio);
      assertClose(`${fixture.name}.completionRate`, nullableNumber(snapshot.completion_rate), fixture.completionRate);

      const frontend = buildWorkContentQualityFromMetrics(
        {
          videoId,
          snapshot: {
            playCount: fixture.playCount,
            likes: fixture.playCount,
            comments: 0,
            shares: 0,
            favorites: 0,
            avgPlayDuration: fixture.avgPlayDuration,
            avgPlayRatio: fixture.avgPlayRatio,
            bounceRate2s: fixture.bounceRate2s,
            completionRate5s: fixture.completionRate5s,
            completionRate: fixture.completionRate,
          },
        },
        { state: "ready", tags: new Map([[videoId, "复盘"]]) },
        standards,
      );

      const projected = await client.query<{ payload: Array<Record<string, unknown> & { id: string }> }>(
        `select public.${temporaryFunctionName}(
          'all', 1, 20, null, 'published_at', 'desc', $1::uuid[], $2::jsonb
        ) as payload`,
        [[profileId], JSON.stringify(filters)],
      );
      const database = projected.rows[0].payload.find((row) => row.id === videoId);
      assert.ok(database, `${fixture.name} 数据库对账投影未返回夹具作品`);
      assertClose(`${fixture.name}.retentionAchievement`, nullableNumber(database.retentionAchievement), frontend.contentAchievement);
      assertClose(`${fixture.name}.interactionAchievement`, nullableNumber(database.interactionAchievement), frontend.interactionAchievement);
      assert.equal(database.retentionGrade, frontend.contentGrade, `${fixture.name} 留存档位不一致`);
      assert.equal(database.overallGrade, frontend.overallGrade, `${fixture.name} 综合评级不一致`);

      const warnings = database.warnings as Record<string, number | null>;
      const frontendWarnings = {
        bounceRate2s: fixture.bounceRate2s == null ? null : fixture.bounceRate2s > standards.bounceRate2s.poor ? 1 : 0,
        completionRate5s: fixture.completionRate5s == null ? null : fixture.completionRate5s <= standards.completionRate5s.poor ? 1 : 0,
        avgPlayDuration: fixture.avgPlayDuration == null ? null : fixture.avgPlayDuration <= standards.avgPlayDuration.poor ? 1 : 0,
        avgPlayRatio: fixture.avgPlayRatio == null ? null : fixture.avgPlayRatio * 100 < standards.avgPlayRatio.poor ? 1 : 0,
        completionRate: fixture.completionRate == null ? null : fixture.completionRate <= standards.completionRate.poor ? 1 : 0,
      };
      for (const [key, expected] of Object.entries(frontendWarnings)) {
        assert.equal(warnings[key], expected, `${fixture.name}.${key} 差线警告不一致`);
      }

      const expectedGrade = frontend.overallGrade;
      const gradeFilters: Array<[string, BreakoutGrade | null]> = [
        ["excellent", "优"],
        ["good", "良"],
        ["fair", "普"],
        ["poor", "劣"],
        ["unrated", null],
      ];
      for (const [gradeFilter, grade] of gradeFilters) {
        const gradePayload = await invokePage(client, baseFilters(standards, gradeFilter), profileId);
        const included = gradePayload.videos?.some((video) => video.id === videoId) ?? false;
        assert.equal(included, grade === expectedGrade, `${fixture.name} RPC ${gradeFilter} 筛选与前端综合评级不一致`);
      }

      await client.query("delete from public.videos where id = $1", [videoId]);
    }
  } finally {
    await client.query("rollback");
    await client.end();
  }
});
