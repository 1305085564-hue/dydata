import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatFeishuTopicContent } from "@/lib/topics/feishu-content";
import { validateFeishuWorkspaceUrl } from "@/lib/topics/feishu-workspace";
import { buildExternalMetrics, computeInternalMetrics } from "@/lib/topics/metrics";
import { buildPoolQueryOptions, matchesTopicPoolQuery } from "@/lib/topics/service";
import { parseClaimsResponse, parseTopicPoolResponse } from "@/lib/topics/v2-client-contract";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("飞书创作内容：包含全部结构化字段与数据证明摘要，无数据不虚构", () => {
  const content = formatFeishuTopicContent({
    title: "打板连板核心手法",
    hook: "三秒讲透分歧转一致",
    topicName: "暴力战法类",
    audience: "有半年实盘经验的短线新手",
    outline: ["分歧的定义", "转一致的买点"],
    sourceType: "internal",
    summary: {
      bestPlayCount: 86000,
      internalMetrics: { qualifiedWorkCount: 2 },
    },
  });
  assert.match(content, /【选题名称】：打板连板核心手法/);
  assert.match(content, /【所属母题】：暴力战法类/);
  assert.match(content, /【一句话钩子】/);
  assert.match(content, /【目标受众】/);
  assert.match(content, /【内容提纲】：\n1\. 分歧的定义/);
  assert.match(content, /【数据证明】：[\s\S]*团队最高播放 86,000/);
  assert.match(content, /达标作品（≥3万播放）2 条/);
  assert.match(content, /【来源】：团队内部已验证/);

  const empty = formatFeishuTopicContent({ title: "极简选题" });
  assert.doesNotMatch(empty, /【数据证明】/);
  assert.doesNotMatch(empty, /0 人/);
});

test("飞书固定地址：只接受安全 https 链接，未配置与非法地址可明确区分", () => {
  const valid = validateFeishuWorkspaceUrl("https://xxx.feishu.cn/wiki/abc");
  assert.equal(valid.ok, true);
  assert.equal(validateFeishuWorkspaceUrl("").ok, false);
  assert.equal(validateFeishuWorkspaceUrl(null)?.ok ?? false, false);
  const insecure = validateFeishuWorkspaceUrl("http://xxx.feishu.cn/wiki/abc");
  assert.equal(insecure.ok, false);
  if (!insecure.ok) assert.equal(insecure.reason, "invalid");
  const garbage = validateFeishuWorkspaceUrl("not-a-url");
  assert.equal(garbage.ok, false);
});

test("内部与外部成绩分开计算，外部来源不生成内部混算指标", () => {
  const internal = computeInternalMetrics([{ playCount: 20000 }, { playCount: 40000 }]);
  assert.deepEqual(
    { best: internal.bestPlayCount, avg: internal.averagePlayCount, qualified: internal.qualifiedWorkCount, total: internal.workCount },
    { best: 40000, avg: 30000, qualified: 1, total: 2 },
  );
  assert.equal(
    buildExternalMetrics({ source_type: "internal", external_play_count: 999999 }),
    null,
  );
  const external = buildExternalMetrics({ source_type: "external", external_play_count: 120000, external_like_count: 8000, external_sample_count: 1 });
  assert.deepEqual(external, { bestPlayCount: 120000, likesCount: 8000, sampleCount: 1 });
});

test("近 7 天人数契约：服务端字段缺失时前端解析为 0，绝不回退累计认领数", () => {
  const parsed = parseTopicPoolResponse({
    items: [{
      id: "sub-1",
      title: "选题一",
      claimCount: 9,
      candidateCount: 9,
      scriptingCount: 9,
      summary: null,
    }],
    pagination: { page: 1, pageSize: 50, totalItems: 1 },
  });
  assert.equal(parsed.items[0]?.claimCount, 9);
  assert.equal(parsed.items[0]?.recent7dParticipants, 0);
  assert.equal(parsed.items[0]?.recent7dCompletedCount, 0);
  assert.equal(parsed.items[0]?.recent7dInProgressCount, 0);
  assert.equal(parsed.items[0]?.isWritingByMe, false);
});

test("V3 真实字段在客户端解析层被完整保留，不再被丢弃", () => {
  const parsed = parseTopicPoolResponse({
    items: [{
      id: "sub-2",
      title: "外部干货",
      source_type: "external",
      duration_seconds: 180,
      outline: "第一部分；第二部分",
      library_status: "in_library",
      summary: {
        qualifiedWorkCount: 1,
        internalMetrics: { bestPlayCount: 30000, averagePlayCount: 30000, qualifiedWorkCount: 1, workCount: 1 },
        externalMetrics: { bestPlayCount: 120000, likesCount: 8000, sampleCount: 1 },
      },
    }],
    pagination: { page: 1, pageSize: 50, totalItems: 1 },
  });
  const item = parsed.items[0];
  assert.equal(item?.source_type, "external");
  assert.equal(item?.duration_seconds, 180);
  assert.equal(item?.duration_range, "2_5m");
  assert.equal(item?.outline, "第一部分；第二部分");
  assert.equal(item?.library_status, "in_library");
  assert.deepEqual(item?.summary?.internalMetrics, { bestPlayCount: 30000, averagePlayCount: 30000, qualifiedWorkCount: 1, workCount: 1 });
  assert.deepEqual(item?.summary?.externalMetrics, { bestPlayCount: 120000, likesCount: 8000, sampleCount: 1 });
});

test("多母题筛选：多个 topic_id 参数全部通过服务端校验", () => {
  const idA = "123e4567-e89b-12d3-a456-426614174001";
  const idB = "123e4567-e89b-12d3-a456-426614174002";
  const result = buildPoolQueryOptions(new URLSearchParams(`topic_id=${idA}&topic_id=${idB}`));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.options.topicIds, [idA, idB]);
});

test("「更多」筛选参数：服务端只接受约定取值", () => {
  const ok = buildPoolQueryOptions(new URLSearchParams("source_type=external&recent_heat=has_in_progress&duration_range=2_5m&performance=high_best_play"));
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.options.sourceType, "external");
  assert.equal(ok.options.recentHeat, "has_in_progress");
  assert.equal(ok.options.durationRange, "2_5m");
  assert.equal(ok.options.performance, "high_best_play");

  assert.equal(buildPoolQueryOptions(new URLSearchParams("source_type=hot")).ok, false);
  assert.equal(buildPoolQueryOptions(new URLSearchParams("recent_heat=yesterday")).ok, false);
  assert.equal(buildPoolQueryOptions(new URLSearchParams("duration_range=5m")).ok, false);
  assert.equal(buildPoolQueryOptions(new URLSearchParams("performance=low")).ok, false);
});

test("搜索匹配对空 Hook 不崩溃，标题或 Hook 命中即返回", () => {
  assert.equal(matchesTopicPoolQuery({ title: "打板干货", hook: null }, "打板"), true);
  assert.equal(matchesTopicPoolQuery({ title: "打板干货", hook: null }, "不相关"), false);
  assert.equal(matchesTopicPoolQuery({ title: "其他", hook: "止盈方法" }, "止盈"), true);
  assert.equal(matchesTopicPoolQuery({ title: "其他", hook: null }, ""), true);
});

test("批量导入与移出/恢复只挂真实后端回调，不存在本地假成功路径", () => {
  const hub = readSource("src/components/topics-v2/TopicHubV2.tsx");
  const importModal = readSource("src/components/topics-v2/TopicBatchImportModal.tsx");
  assert.match(hub, /\/api\/admin\/topics-library\/import\/parse/);
  assert.match(hub, /\/api\/admin\/topics-library\/import\/confirm/);
  assert.match(hub, /fileName/);
  assert.doesNotMatch(hub, /setIsBatchImportModalOpen\(true\)(?![\s\S]*canManageTopicLibrary)/);
  assert.match(importModal, /onDrop={handleDrop}/);
  assert.match(importModal, /fileInfo\?\.name/);
  const contentPage = readSource("src/app/(app)/admin/content/content-page-client.tsx");
  assert.match(contentPage, /\/api\/admin\/topics-library\/toggle/);
});

test("更多筛选是真实可操作项，取值与服务端契约一致", () => {
  const drawer = readSource("src/components/topics-v2/TopicMoreFiltersDrawer.tsx");
  assert.match(drawer, /filters/);
  assert.match(drawer, /onChange/);
  assert.match(drawer, /aria-pressed/);
  assert.match(drawer, /has_participants/);
  assert.match(drawer, /has_completed/);
  assert.match(drawer, /has_in_progress/);
  assert.match(drawer, /no_participants/);
  assert.match(drawer, /under_2m/);
  assert.match(drawer, /2_5m/);
  assert.match(drawer, /over_5m/);
  assert.match(drawer, /high_best_play/);
  assert.match(drawer, /high_qualified/);
  assert.match(drawer, /high_avg_play/);
  assert.doesNotMatch(drawer, /待后端接入|待 Codex 接入后端/);
});

test("选题库保留三条进货入口，手动录入走真实创建接口", () => {
  const hub = readSource("src/components/topics-v2/TopicHubV2.tsx");
  const explorer = readSource("src/components/topics-v2/TopicPoolExplorer.tsx");
  const createModal = readSource("src/components/topics-v2/TopicCreateModal.tsx");
  assert.match(hub, /TopicCreateModal/);
  assert.match(hub, /isCreateModalOpen/);
  assert.match(hub, /setIsCreateModalOpen\(true\)/);
  assert.match(explorer, /onCreateClick/);
  assert.match(explorer, /录入选题/);
  assert.match(createModal, /\/api\/topics\/sub-topics/);
  assert.match(createModal, /method: "POST"/);
  assert.match(createModal, /parseCreatedSubTopicResponse/);
  assert.match(hub, /TopicBatchImportModal/);
});

test("选题库顶部视角使用业务约定文案", () => {
  const explorer = readSource("src/components/topics-v2/TopicPoolExplorer.tsx");
  assert.match(explorer, /我的选题/);
  assert.match(explorer, /在写选题/);
  assert.doesNotMatch(explorer, /我录入的|我在写的/);
});

test("团队动态使用写作语义，点击动态打开对应选题详情", () => {
  const activity = readSource("src/components/topics-v2/TeamActivitySection.tsx");
  const hub = readSource("src/components/topics-v2/TopicHubV2.tsx");
  assert.doesNotMatch(activity, /最新认领|往期认领|认领选题/);
  assert.match(activity, /最新在写|写作记录/);
  assert.match(hub, /setInspectTopicId\(topicId\)/);
});

test("近 7 天写作摘要从服务端返回并保留，不把累计认领数当热度", () => {
  const parsed = parseClaimsResponse({
    claims: [],
    candidateCount: 0,
    scriptingCount: 0,
    recent7dSummary: { participants: 4, completedCount: 2, inProgressCount: 2 },
  });
  assert.deepEqual(parsed.recent7dSummary, {
    participants: 4,
    completedCount: 2,
    inProgressCount: 2,
  });
});

test("详情页依赖的当前用户与批量导入字段已接入真实接口", () => {
  const operatorRoute = readSource("src/app/api/dashboard/operator-members/route.ts");
  const importRoute = readSource("src/app/api/admin/topics-library/import/confirm/route.ts");
  assert.match(operatorRoute, /currentUserId:\s*user\.id/);
  assert.match(importRoute, /historyPlay/);
  assert.match(importRoute, /historyLikes/);
  assert.doesNotMatch(importRoute, /historyPlay:\s*null[\s\S]*historyLikes:\s*null/);
});
