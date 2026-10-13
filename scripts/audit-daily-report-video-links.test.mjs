import assert from "node:assert/strict";
import test from "node:test";

import { buildAuditOutput, buildVideoFirstAuditOutput, fetchPublishedVideos } from "./audit-daily-report-video-links.mjs";

const range = { from: "2026-09-08", to: "2026-09-08", timezone: "Asia/Shanghai" };

function report(overrides = {}) {
  return {
    id: "report-1",
    user_id: "user-1",
    account_id: "account-1",
    report_date: "2026-09-08",
    title: "Report title",
    video_id: null,
    is_void: false,
    ...overrides,
  };
}

function video(overrides = {}) {
  return {
    id: "video-1",
    user_id: "user-1",
    account_id: "account-1",
    video_title: "Video title",
    published_at: "2026-09-08T04:00:00.000Z",
    uploaded_at: null,
    lifecycle_state: "active",
    ...overrides,
  };
}

test("videos-first published query only scans active videos", async () => {
  const filters = [];
  const query = {
    select() { return this; },
    gte() { return this; },
    lt() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    order() { return this; },
    range() { return Promise.resolve({ data: [], error: null }); },
  };

  await fetchPublishedVideos({ from() { return query; } }, "2026-10-01", "2026-10-13");

  assert.deepEqual(filters, [["lifecycle_state", "active"]]);
});

test("keeps an unbound same-day active video as a unique candidate", () => {
  const output = buildAuditOutput([report()], [video()], [], range);

  assert.equal(output.summary.unique_unlinked_candidates, 1);
  assert.equal(output.summary.conflict_unlinked, 0);
  assert.deepEqual(output.unique_unlinked_candidates[0].report.report_id, "report-1");
  assert.deepEqual(output.unique_unlinked_candidates[0].matched_active_videos[0].video_id, "video-1");
});

test("does not classify an already-bound active video as a unique candidate", () => {
  const output = buildAuditOutput(
    [report()],
    [video()],
    [{ id: "existing-report", video_id: "video-1", account_id: "account-1", report_date: "2026-09-08", title: "Existing", is_void: false }],
    range,
  );

  assert.equal(output.summary.unique_unlinked_candidates, 0);
  assert.equal(output.summary.conflict_unlinked, 1);
  assert.equal(output.conflict_unlinked[0].conflict_reason, "candidate_video_already_bound");
  assert.deepEqual(output.conflict_unlinked[0].bound_active_reports, [
    {
      report_id: "existing-report",
      video_id: "video-1",
      account_id: "account-1",
      report_date: "2026-09-08",
      title: "Existing",
      is_void: false,
    },
  ]);
});

test("video-first audit surfaces a video with snapshot and screenshots but no active daily report", () => {
  const output = buildVideoFirstAuditOutput(
    [video({ id: "video-orphan", published_at: "2026-09-08T04:00:00.000Z" })],
    [{
      id: "snapshot-1",
      video_id: "video-orphan",
      snapshot_type: "24h",
      play_count: 899,
      screenshot_urls: ["one.png", "two.png"],
      curve_screenshot_url: null,
      retention_screenshot_url: "two.png",
      captured_at: "2026-09-09T04:00:00.000Z",
      vs_previous: { published_at_text: "2026年9月8日 12:00", published_at_confidence: "high" },
    }],
    [],
    range,
  );

  assert.equal(output.summary.videos_scanned, 1);
  assert.equal(output.summary.with_24h_snapshot, 1);
  assert.equal(output.summary.with_screenshots, 1);
  assert.equal(output.summary.with_ocr_publish_evidence, 1);
  assert.equal(output.summary.missing_active_report, 1);
  assert.equal(output.chains[0].snapshot_24h.screenshot_count, 2);
  assert.equal(output.chains[0].chain_status, "missing_active_report");
});

test("video-first audit distinguishes a bound report from a report-date mismatch", () => {
  const output = buildVideoFirstAuditOutput(
    [video({ id: "video-bound", published_at: "2026-09-08T04:00:00.000Z" })],
    [{
      id: "snapshot-2",
      video_id: "video-bound",
      snapshot_type: "24h",
      play_count: 100,
      screenshot_urls: [],
      curve_screenshot_url: null,
      retention_screenshot_url: null,
      captured_at: "2026-09-09T04:00:00.000Z",
      vs_previous: null,
    }],
    [{
      id: "report-bound",
      user_id: "user-1",
      account_id: "account-1",
      video_id: "video-bound",
      report_date: "2026-09-09",
      title: "Report title",
      play_count: 100,
      published_at: null,
      uploaded_at: "2026-09-09T05:00:00.000Z",
      data_source: "manual",
      is_void: false,
    }],
    range,
  );

  assert.equal(output.summary.missing_active_report, 0);
  assert.equal(output.summary.report_date_mismatch, 1);
  assert.equal(output.chains[0].chain_status, "bound");
  assert.deepEqual(output.chains[0].report_date_mismatch, ["2026-09-09"]);
});

test("video-first audit chooses the latest 24h snapshot by captured_at even when the query is unordered", () => {
  const output = buildVideoFirstAuditOutput(
    [video({ id: "video-snapshot-order", published_at: "2026-09-08T04:00:00.000Z" })],
    [
      {
        id: "snapshot-newer",
        video_id: "video-snapshot-order",
        snapshot_type: "24h",
        play_count: 900,
        screenshot_urls: ["new.png"],
        curve_screenshot_url: null,
        retention_screenshot_url: null,
        captured_at: "2026-09-09T05:00:00.000Z",
        vs_previous: { published_at_text: "2026年9月8日 12:00", published_at_confidence: "high" },
      },
      {
        id: "snapshot-older",
        video_id: "video-snapshot-order",
        snapshot_type: "24h",
        play_count: 100,
        screenshot_urls: [],
        curve_screenshot_url: null,
        retention_screenshot_url: null,
        captured_at: "2026-09-09T04:00:00.000Z",
        vs_previous: null,
      },
    ],
    [],
    range,
  );

  assert.equal(output.chains[0].snapshot_24h.latest_captured_at, "2026-09-09T05:00:00.000Z");
  assert.equal(output.chains[0].snapshot_24h.play_count, 900);
  assert.equal(output.summary.with_screenshots, 1);
  assert.equal(output.summary.with_ocr_publish_evidence, 1);
});
