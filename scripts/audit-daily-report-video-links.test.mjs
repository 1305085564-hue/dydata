import assert from "node:assert/strict";
import test from "node:test";

import { buildAuditOutput } from "./audit-daily-report-video-links.mjs";

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
