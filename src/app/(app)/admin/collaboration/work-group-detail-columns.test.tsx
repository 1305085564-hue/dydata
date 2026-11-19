import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ContentQualitySummary } from "@/lib/collaboration/content-quality-contract";
import {
  InteractionDetailCells,
  InteractionDetailHeads,
  RetentionDetailCells,
  RetentionDetailHeads,
} from "./work-group-detail-columns";

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const quality = {
  retentionAverages: {
    bounceRate2s: 28.46,
    completionRate5s: 62,
    avgPlayDuration: 14.4,
    avgPlayRatio: 35.25,
    completionRate: null,
  },
} as ContentQualitySummary;

test("互动明细：赞、评、转、藏四项表头与数值，缺值显示 —", () => {
  const html = renderToStaticMarkup(
    <table>
      <thead>
        <tr>
          <InteractionDetailHeads
            renderHead={(_field, label) => <th>{label}</th>}
          />
        </tr>
      </thead>
      <tbody>
        <tr>
          <InteractionDetailCells
            metrics={{ likeRate: 0.025, commentRate: 0.005, shareRate: null, favoriteRate: 0.0125 }}
          />
        </tr>
      </tbody>
    </table>,
  );
  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]));
  assert.deepEqual(headers, ["点赞率", "评论率", "转发率", "收藏率"]);
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
  assert.deepEqual(cells, ["2.5%", "0.5%", "—", "1.3%"]);
});

test("互动明细：只有点赞率和收藏率保留排序入口", () => {
  const fields: Array<string | null> = [];
  renderToStaticMarkup(
    <table>
      <thead>
        <tr>
          <InteractionDetailHeads
            renderHead={(field, label) => {
              fields.push(field);
              return <th>{label}</th>;
            }}
          />
        </tr>
      </thead>
    </table>,
  );
  assert.deepEqual(fields, ["likeRate", null, null, "favoriteRate"]);
});

test("留存明细：五项表头，数值带单位，样本内缺项显示 —", () => {
  const html = renderToStaticMarkup(
    <table>
      <thead>
        <tr>
          <RetentionDetailHeads />
        </tr>
      </thead>
      <tbody>
        <tr>
          <RetentionDetailCells contentQuality={quality} />
        </tr>
      </tbody>
    </table>,
  );
  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]));
  assert.deepEqual(headers, ["2秒跳出率", "5秒完播率", "均播时长", "播放占比", "整体完播率"]);
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
  assert.deepEqual(cells, ["28.5%", "62%", "14s", "35.3%", "—"]);
});

test("留存明细：没有质量数据（运营或无样本）时整行 —", () => {
  const html = renderToStaticMarkup(
    <table>
      <tbody>
        <tr>
          <RetentionDetailCells contentQuality={null} />
        </tr>
      </tbody>
    </table>,
  );
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
  assert.deepEqual(cells, ["—", "—", "—", "—", "—"]);
});
