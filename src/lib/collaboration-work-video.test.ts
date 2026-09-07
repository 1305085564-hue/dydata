import assert from "node:assert/strict";
import test from "node:test";

import { matchWorkVideoByBusinessDate } from "./collaboration-work-video";

const report = {
  id: "report-1",
  accountId: "account-1",
  reportDate: "2026-09-07",
};

test("岗位作品只匹配同账号、同上海业务日的唯一视频", () => {
  const result = matchWorkVideoByBusinessDate({
    report,
    videos: [
      {
        id: "video-1",
        accountId: "account-1",
        publishedAt: "2026-09-06T16:30:00.000Z",
        uploadedAt: null,
      },
      {
        id: "video-other-day",
        accountId: "account-1",
        publishedAt: "2026-09-07T16:30:00.000Z",
        uploadedAt: null,
      },
    ],
  });

  assert.deepEqual(result, { kind: "found", videoId: "video-1" });
});

test("岗位作品没有同日视频时明确返回未找到", () => {
  const result = matchWorkVideoByBusinessDate({
    report,
    videos: [
      {
        id: "video-other-day",
        accountId: "account-1",
        publishedAt: "2026-09-07T16:30:00.000Z",
        uploadedAt: null,
      },
    ],
  });

  assert.deepEqual(result, { kind: "not_found" });
});

test("同一账号同日多条视频不擅自选择，明确返回冲突", () => {
  const result = matchWorkVideoByBusinessDate({
    report,
    videos: [
      {
        id: "video-1",
        accountId: "account-1",
        publishedAt: "2026-09-06T16:30:00.000Z",
        uploadedAt: null,
      },
      {
        id: "video-2",
        accountId: "account-1",
        publishedAt: null,
        uploadedAt: "2026-09-06T17:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(result, { kind: "ambiguous", count: 2 });
});
