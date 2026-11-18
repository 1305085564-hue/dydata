import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { JoinBannerClient } from "./join-banner-client";

test("未分配账号会渲染可见的入团入口", () => {
  const html = renderToStaticMarkup(
    <JoinBannerClient mode="unassigned" teams={[{ id: "team-1", name: "内容一部" }]} />,
  );

  assert.match(html, /你还未加入团队/);
  assert.match(html, /申请加入团队/);
  assert.match(html, /通过后即可提交日报、豁免和协作内容。/);
});

test("待审核账号会渲染撤销申请入口", () => {
  const html = renderToStaticMarkup(
    <JoinBannerClient mode="pending" requestId="req-1" targetTeamName="内容一部" />,
  );

  assert.match(html, /团队申请审核中/);
  assert.match(html, /撤销申请/);
  assert.match(html, /目标团队：内容一部/);
});

test("入团申请被驳回：横幅显示「未通过：原因」并可重新申请", () => {
  const html = renderToStaticMarkup(
    <JoinBannerClient mode="rejected" teams={[{ id: "team-1", name: "内容一部" }]} targetTeamName="内容一部" reviewNote="名额已满，下月再申请" />,
  );

  assert.match(html, /入团申请未通过/);
  assert.match(html, /未通过：名额已满，下月再申请/);
  assert.match(html, /重新申请加入团队/);
});

test("驳回没写原因时只显示未通过", () => {
  const html = renderToStaticMarkup(
    <JoinBannerClient mode="rejected" teams={[]} targetTeamName="" reviewNote={null} />,
  );

  assert.match(html, /未通过</);
  assert.doesNotMatch(html, /未通过：/);
});
