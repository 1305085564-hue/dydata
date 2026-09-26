import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function walkSources(dir: string): string[] {
  return readdirSync(resolve(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walkSources(relative);
    return /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

test("/growth 页面与其专属实现保持删除状态", () => {
  const removedPaths = [
    "src/app/(app)/growth/page.tsx",
    "src/app/(app)/growth/growth-client.tsx",
    "src/app/(app)/growth/growth-data-container.tsx",
    "src/lib/loaders/growth-page.ts",
    "src/lib/growth-page.ts",
    "src/app/api/dashboard/trend/route.ts",
    "src/components/charts/result-trend.tsx",
    "src/components/growth/六维雷达面板.tsx",
  ];

  for (const path of removedPaths) {
    assert.equal(
      existsSync(resolve(process.cwd(), path)),
      false,
      `${path} 已随 /growth 下线删除，不得复活`,
    );
  }
});

test("活跃代码不再出现已删除成长页的路由跳转、导航入口或埋点路径", () => {
  // 本守卫文件自身需要在断言里写出该路由名，故从扫描范围中排除。
  const offenders = walkSources("src")
    .filter((path) => path !== "src/lib/growth-removal.test.ts")
    .filter((path) => /["'`]\/growth/.test(source(path)));

  assert.deepEqual(
    offenders,
    [],
    `以下文件仍把用户带向已删除的成长页路由：${offenders.join(", ")}`,
  );
});

test("工作台不得把数据管理冒充成提交后的成长反馈入口", () => {
  const workbenchSurfaces = [
    "src/app/(app)/dashboard/video-submit-panel-v2.tsx",
    "src/app/(app)/dashboard/video-submit-form-v2.tsx",
  ];

  for (const path of workbenchSurfaces) {
    assert.doesNotMatch(
      source(path),
      /\/admin\/collaboration/,
      `${path} 不得把数据管理当成成长反馈入口`,
    );
    assert.doesNotMatch(
      source(path),
      /成长复盘|成长分析/,
      `${path} 不得再承诺已下线的成长复盘`,
    );
  }
});

test("活跃产品元数据不再把产品描述为成长复盘平台", () => {
  const productSurfaces = [
    "src/app/layout.tsx",
    "src/app/opengraph-image.tsx",
    "src/components/nav-bar-items.ts",
  ];

  for (const path of productSurfaces) {
    assert.doesNotMatch(source(path), /成长复盘|成长分析/, `${path} 仍把产品描述为成长复盘`);
  }
});

test("排行榜仅保留文件、本批未接入口：页面与导航均不得引用榜单", () => {
  const pageOffenders = walkSources("src/app").filter((path) =>
    /components\/leaderboard/.test(source(path)),
  );

  assert.deepEqual(pageOffenders, [], "页面目录不得引用榜单组件（本批未接入排行榜，见待办清单）");
  assert.doesNotMatch(
    source("src/components/nav-bar-items.ts"),
    /leaderboard/i,
    "导航不得出现排行榜入口（本批未接入排行榜，见待办清单）",
  );
});
