import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  clearPersonDataCache,
  getPersonDataCacheKey,
  loadPersonData,
  prefetchPersonData,
  readPersonDataCache,
  writePersonDataCache,
} from "./person-data";
import type { PersonDetailData } from "./types";

const personData = {
  userId: "user-1",
  name: "成员 A",
  teamId: "team-1",
  currentMonth: {
    writerCount: 0,
    editorCount: 0,
    operatorCount: 0,
  },
  growthWorks: [],
  growthSummary: null,
  records: [],
  operatorSummary: null,
} satisfies PersonDetailData;

test("clearPersonDataCache 只清理指定用户的月份缓存", () => {
  writePersonDataCache("user-1-2026-9", personData);
  writePersonDataCache("user-1-2026-8", personData);
  writePersonDataCache("user-2-2026-9", personData);

  clearPersonDataCache("user-1");

  assert.equal(readPersonDataCache("user-1-2026-9"), null);
  assert.equal(readPersonDataCache("user-1-2026-8"), null);
  assert.equal(readPersonDataCache("user-2-2026-9"), personData);
  clearPersonDataCache("user-2");
});

test("clearPersonDataCache 会阻止已在路上的旧请求回写缓存", async () => {
  const originalFetch = globalThis.fetch;
  const fetchControl: { resolve?: (response: Response) => void } = {};
  globalThis.fetch = (() => new Promise<Response>((resolve) => {
    fetchControl.resolve = resolve;
  })) as typeof fetch;

  try {
    const pending = loadPersonData("user-1", 2026, 9);
    clearPersonDataCache("user-1");

    assert.ok(fetchControl.resolve);
    fetchControl.resolve(Response.json(personData));
    await pending;

    assert.equal(readPersonDataCache("user-1-2026-9"), null);
  } finally {
    globalThis.fetch = originalFetch;
    clearPersonDataCache("user-1");
  }
});

test("personal-card.tsx 源码断言：旧6个月柱状图已被彻底移除，升级为近30天作品质量增长折线图", () => {
  const cardPath = path.resolve(
    process.cwd(),
    "src/app/(app)/admin/collaboration/personal-card.tsx",
  );
  const content = fs.readFileSync(cardPath, "utf-8");

  assert.ok(!content.includes("近 6 个月协同产量趋势"), "旧柱状图标题必须被移除");
  assert.ok(!content.includes("BarChart"), "必须移除 BarChart 引用");
  assert.ok(!content.includes("data?.trend"), "必须移除 data?.trend 引用");

  assert.ok(content.includes("近 30 天作品质量增长曲线"), "必须展示近 30 天作品质量增长曲线标题");
  assert.ok(content.includes("LineChart"), "必须引入 LineChart 折线图组件");
  assert.ok(content.includes("interactionRate"), "必须绘制互动率");
  assert.ok(content.includes("likeRate"), "必须绘制点赞率");
  assert.ok(content.includes("favoriteRate"), "必须绘制收藏率");
  assert.ok(content.includes("pendingPoint"), "必须保留未采快照的灰色待采集点");
  assert.ok(content.includes("数据待采集（未满 24 小时）"), "未采快照浮层必须提示数据待采集");
  assert.ok(content.includes("openDiagnosisByReportId"), "点击数据点必须接通视频诊断联动");
  assert.ok(content.includes("resolveChartPoint"), "必须具备 chart state 数据点解析函数以适配 Recharts onMouseMove");
  assert.ok(content.includes("GrowthTooltipBridge"), "必须具备 Tooltip 桥接组件以确保悬停/触控毫秒级投射");
});

test("prefetchPersonData 支持传入 role 岗位，并与 loadPersonData 命中相同缓存", async () => {
  const dummy: PersonDetailData = {
    userId: "user-test",
    name: "测试成员",
    teamId: null,
    currentMonth: { writerCount: 1, editorCount: 0, operatorCount: 0 },
    operatorSummary: null,
    growthSummary: null,
    growthWorks: [
      {
        reportId: "rep-1",
        videoId: "vid-1",
        title: "作品 1",
        accountName: "测试账号",
        reportDate: "2026-09-20",
        playCount: 10000,
        roles: ["writer"],
        hasSnapshot: true,
        interactionRate: 0.035,
        likeRate: 0.02,
        favoriteRate: 0.015,
      },
    ],
    records: [],
  };

  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => dummy,
    } as Response;
  }) as typeof fetch;

  try {
    clearPersonDataCache("user-test");
    prefetchPersonData("user-test", 2026, 9, "writers");

    // 等待异步预加载微任务完成
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(requestedUrl.includes("role=writers"), "请求 URL 必须携带 role=writers");

    // 读取缓存验证命中相同 key
    const cached = readPersonDataCache(getPersonDataCacheKey("user-test", 2026, 9, "writers"));
    assert.ok(cached !== null, "必须在带有 role 的 key 下写入缓存");
    assert.equal(cached?.growthWorks.length, 1);
    assert.equal(cached?.growthWorks[0].interactionRate, 0.035);

    // 调用 loadPersonData 应直接命中内存缓存，不再发起 fetch
    requestedUrl = "";
    const loaded = await loadPersonData("user-test", 2026, 9, "writers");
    assert.equal(requestedUrl, "", "命中缓存时不应重复发起网络请求");
    assert.deepEqual(loaded, dummy);
  } finally {
    globalThis.fetch = originalFetch;
    clearPersonDataCache("user-test");
  }
});
