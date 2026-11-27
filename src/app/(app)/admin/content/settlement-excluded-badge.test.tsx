import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoRow } from "@/lib/content/domain/detail";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import {
  attachSettlementExclusionsToVideos,
  loadVideoSettlementExclusions,
} from "@/lib/loaders/admin-content-rpc";
import { StatusMark } from "./content-list-row-parts";
import { ContentDetailHeadline, ContentDetailNotices } from "./detail/content-detail-metrics";
import { OverallGradeBreakdownContent } from "@/components/admin/quality-tooltip-content";
import { excellentCountColumn } from "../collaboration/collaboration-quality-hints";

function makeVideo(overrides: Partial<VideoRow> = {}): VideoRow {
  return {
    id: "video-1",
    account_id: "acc-1",
    user_id: "user-1",
    video_url: "https://www.douyin.com/video/123",
    video_title: "测试作品标题",
    content: "测试正文",
    published_at: "2026-11-26T10:00:00Z",
    uploaded_at: "2026-11-27T10:30:00Z",
    anomaly_status: "normal",
    lifecycle_state: "active",
    created_at: "2026-11-27T10:30:00Z",
    accounts: { name: "测试账号", profile_id: "user-1" },
    profiles: { name: "测试作者" },
    ...overrides,
  } as VideoRow;
}

test("loadVideoSettlementExclusions 只挂载被标为不计优结算的作品，旧库缺列时优雅降级", async () => {
  const okClient = {
    from() {
      return {
        select() {
          return {
            in() {
              return {
                async eq() {
                  return {
                    data: [
                      {
                        id: "video-2",
                        settlement_excluded: true,
                        settlement_excluded_reason: "超期补交且无原始发布凭证",
                      },
                    ],
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const exclusions = await loadVideoSettlementExclusions(okClient, ["video-1", "video-2"]);
  assert.equal(exclusions.size, 1);
  assert.deepEqual(exclusions.get("video-2"), {
    excluded: true,
    reason: "超期补交且无原始发布凭证",
  });

  const attached = attachSettlementExclusionsToVideos(
    [makeVideo({ id: "video-1" }), makeVideo({ id: "video-2" })],
    exclusions,
  );
  assert.equal(attached[0].settlement_excluded, undefined);
  assert.equal(attached[1].settlement_excluded, true);
  assert.equal(attached[1].settlement_excluded_reason, "超期补交且无原始发布凭证");

  const legacyClient = {
    from() {
      return {
        select() {
          return {
            in() {
              return {
                async eq() {
                  return { data: null, error: { message: "column settlement_excluded does not exist" } };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  const fallback = await loadVideoSettlementExclusions(legacyClient, ["video-1"]);
  assert.equal(fallback.size, 0);
});

test("视频复盘列表徽标、详情抽屉与评级明细均准确呈现「不计优结算」状态与原因", () => {
  const normalHtml = renderToStaticMarkup(<StatusMark video={makeVideo()} />);
  assert.equal(normalHtml, "");

  const excludedVideo = makeVideo({
    settlement_excluded: true,
    settlement_excluded_reason: "发布时间核实不符",
  });
  const badgeHtml = renderToStaticMarkup(<StatusMark video={excludedVideo} />);
  assert.match(badgeHtml, /不计优结算/);

  const noticeHtml = renderToStaticMarkup(
    <ContentDetailNotices video={excludedVideo} canPurge={false} isPurgeEligible={() => false} />,
  );
  assert.match(noticeHtml, /不计入文案优条数结算/);
  assert.match(noticeHtml, /发布时间核实不符/);

  const headlineHtml = renderToStaticMarkup(
    <ContentDetailHeadline video={excludedVideo} snapshot={null} />,
  );
  assert.match(headlineHtml, /不计优结算/);

  const quality: WorkContentQuality & { overallGrade: "优" } = {
    status: "rated",
    topicKind: "dry_goods",
    snapshotPlayCount: 20_000,
    interactionValue: 0.05,
    interactionAchievement: 140,
    contentAchievement: 120,
    contentGrade: "优",
    overallGrade: "优",
    settlementExcluded: true,
    settlementExcludedReason: "发布时间核实不符",
  };
  const breakdownHtml = renderToStaticMarkup(
    <OverallGradeBreakdownContent quality={quality} playCount={20_000} rules={null} />,
  );
  assert.match(breakdownHtml, /已标为不计优结算：发布时间核实不符/);
});

test("协作管理文案「优条数」列在存在排除优作品时渲染有效数并保留排序口径", () => {
  const col = excellentCountColumn<{
    writerQuality: {
      state: "ready";
      summary: {
        ratedCount: number;
        overallGradeCounts: { excellent: number; good: number; average: number; poor: number };
        excludedExcellentCount?: number;
        settlementEligibleExcellentCount?: number;
      };
    };
  }>((row) => row.writerQuality as never);

  const row = {
    writerQuality: {
      state: "ready" as const,
      summary: {
        ratedCount: 5,
        overallGradeCounts: { excellent: 3, good: 1, average: 1, poor: 0 },
        excludedExcellentCount: 1,
        settlementEligibleExcellentCount: 2,
      },
    },
  };
  assert.equal(col.sortValue?.(row), 2);
  const rendered = renderToStaticMarkup(<>{col.render(row)}</>);
  assert.match(rendered, />2</);
});
