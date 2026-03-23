import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { HitAnalyzer } from "./hit-analyzer";

test("空标题报告不会导致爆款分析器崩溃", () => {
  const html = renderToStaticMarkup(
    <HitAnalyzer
      reports={[
        {
          id: "r1",
          submitter: "小王",
          title: null,
          report_date: "2026-03-22",
          play_count: 12345,
          completion_rate: "25%",
          avg_play_duration: "12秒",
          bounce_rate_2s: null,
          completion_rate_5s: null,
          likes: 10,
          comments: 2,
          shares: 1,
          favorites: 3,
          follower_gain: 4,
          follower_convert: null,
          content: "一段文案",
          published_at: "2026-03-22T10:00:00.000Z",
        },
      ]}
      submitters={["小王"]}
    />,
  );

  assert.match(html, /爆款分析/);
});
