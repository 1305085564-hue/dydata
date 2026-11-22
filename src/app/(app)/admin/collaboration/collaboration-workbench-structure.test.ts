import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildCollaborationHeadline,
  partitionWriterCandidates,
  pinCurrentUserFirst,
  ROLE_ZERO_OUTPUT_RULE_TEXT,
} from "@/lib/collaboration/domain/workbench-state";

const source = [
  "src/app/(app)/admin/collaboration/collaboration-workbench.tsx",
  "src/app/(app)/admin/collaboration/collaboration-workbench-toolbar.tsx",
  "src/app/(app)/admin/collaboration/collaboration-workbench-content.tsx",
  "src/lib/collaboration/domain/workbench-state.ts",
  "src/app/(app)/admin/collaboration/workbench-prefetch.ts",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

const dialogSource = [
  "src/app/(app)/admin/content/content-detail-dialog.tsx",
  "src/app/(app)/admin/content/detail/content-detail-metrics.tsx",
  "src/app/(app)/admin/content/detail/content-detail-evidence.tsx",
  "src/app/(app)/admin/content/detail/content-detail-preview.tsx",
  "src/app/(app)/admin/content/content-detail-lifecycle.ts",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

test("协作工作台使用统一视频详情抽屉并按视频管理权限开放生命周期操作", () => {
  assert.match(source, /<ContentDetailDialog/);
  assert.match(source, /video=\{diagnosisDetail\.video\}/);
  assert.match(source, /snapshot=\{diagnosisDetail\.snapshot\}/);
  assert.match(source, /canOperateLifecycle=\{canManageVideos\}/);
});

test("数据管理切页签用 history.replaceState 镜像 URL，不污染历史、也不触发服务端重取", () => {
  const handleTabChangeBody = source.match(/const handleTabChange = \(nextTab: TabKey\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";

  assert.match(handleTabChangeBody, /history\.replaceState\(/);
  assert.doesNotMatch(handleTabChangeBody, /router\.replace\(`/);
  assert.doesNotMatch(handleTabChangeBody, /router\.push\(`/);
});

test("数据管理使用月份选择器，不再显示两侧翻月按钮", () => {
  const toolbarSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/collaboration/collaboration-workbench-toolbar.tsx"),
    "utf8",
  );
  assert.match(toolbarSource, /onValueChange=\{onMonthChange\}/);
  assert.doesNotMatch(toolbarSource, /aria-label="上一月"|aria-label="下一月"/);
});

test("Toolbar 文案徽标数只计已认证与本月有产出成员，未认证零产出候选折叠在 WriterTab 表底", () => {
  const toolbarSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/collaboration/collaboration-workbench-toolbar.tsx"),
    "utf8",
  );
  const writerTabSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/collaboration/writer-tab.tsx"),
    "utf8",
  );

  // 1. 源码契约：Toolbar 与 WriterTab 共用 partitionWriterCandidates 唯一来源
  assert.match(toolbarSource, /label: "文案",\s*count: activeWriterCount/);
  assert.match(toolbarSource, /partitionWriterCandidates\(writerStaff, writerCandidates\)/);
  assert.match(writerTabSource, /partitionWriterCandidates\(\s*rows,\s*candidates,\s*\)/);
  assert.match(writerTabSource, /还有 \$\{uncertifiedRows\.length\} 位未认证候选人/);

  // 2. 行为实测：5 名在岗/有产出文案 + 25 名未认证零产出候选 → 页签为 5，折叠候选为 25
  const mockWriterStaff = [
    { userId: "u1", name: "文案1", reportCount: 6 },
    { userId: "u2", name: "文案2", reportCount: 4 },
    { userId: "u3", name: "文案3", reportCount: 2 },
    { userId: "u4", name: "已认证零产出A", reportCount: 0 },
  ];
  const mockCandidates = [
    { userId: "u2", name: "文案2", certified: true }, // 已在 writerStaff 中，不重复计
    { userId: "u5", name: "新认证零产出B", certified: true }, // 已认证增量 → 计入主表
    ...Array.from({ length: 25 }, (_, idx) => ({
      userId: `cand-${idx + 1}`,
      name: `候选${idx + 1}`,
      certified: false,
    })),
  ];

  const partitioned = partitionWriterCandidates(mockWriterStaff, mockCandidates);
  assert.equal(partitioned.activeWriterCount, 5, "页签数字只显示 5 名已认证/有产出文案");
  assert.equal(partitioned.uncertifiedCandidates.length, 25, "25 名未认证零产出候选折叠在表底");
});

test("个人档案抽屉先展示所选月份作品明细，再展示近 30 天增长曲线", () => {
  const cardSource = readFileSync(new URL("./personal-card.tsx", import.meta.url), "utf8");
  const worksIdx = cardSource.indexOf("<PersonalCardWorks");
  const growthIdx = cardSource.indexOf("<PersonalCardGrowth");
  assert.ok(worksIdx > 0 && growthIdx > worksIdx, "PersonalCardWorks 必须排在 PersonalCardGrowth 之前");
});

test("组员视角支持本人行置顶标识与零产出规则提示", () => {
  const ordered = pinCurrentUserFirst(
    [{ userId: "u-a" }, { userId: "u-self" }, { userId: "u-b" }],
    "u-self",
  );
  assert.deepEqual(ordered.map((r) => r.userId), ["u-self", "u-a", "u-b"]);
  for (const key of ["talents", "operators", "writers", "editors"] as const) {
    assert.match(ROLE_ZERO_OUTPUT_RULE_TEXT[key], /你本月暂无计入该岗位的作品（统计规则：/);
  }
});

test("标题就是本月事实结论：只写事实，不点名掉队；组员只看自己时写「我的」", () => {
  assert.equal(
    buildCollaborationHeadline({ month: 11, overview: { total: 291, goodExcellentRate: 0.352 } }),
    "11月 · 全团 291 篇，良优率 35%",
  );
  assert.equal(
    buildCollaborationHeadline({ month: 11, overview: { total: 12, goodExcellentRate: null, restrictToSelf: true } }),
    "11月 · 我的 12 篇",
  );
  assert.equal(
    buildCollaborationHeadline({ month: 10, overview: { total: 0, goodExcellentRate: null } }),
    "10月 · 全团还没有作品",
  );
  assert.equal(buildCollaborationHeadline({ month: 9, loadFailed: true, overview: null }), "9月 · 数据没加载出来");
  assert.doesNotMatch(pageSource, /title="协作管理"/, "固定标题与灰色导语已删除");
  assert.doesNotMatch(source, /usePublishPageEpigraph/);
  assert.match(source, /<h1 className="font-serif[^"]*">\s*\{headline\}/);
});

test("切换只剩一排：达人 · 文案 · 运营 · 剪辑 · 小队；全页唯一橙色只给署名补全", () => {
  const toolbarSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/collaboration/collaboration-workbench-toolbar.tsx"),
    "utf8",
  );
  const healthSource = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/collaboration/health-bar.tsx"), "utf8");
  const selfHintSource = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/collaboration/member-self-hint.tsx"), "utf8");
  assert.doesNotMatch(toolbarSource, /按岗位|按小队/);
  const order = ["\"talents\"", "\"writers\"", "\"operators\"", "\"editors\"", "\"teams\""].map((key) =>
    toolbarSource.indexOf(`key: ${key}`),
  );
  assert.ok(order.every((idx, i) => idx > 0 && (i === 0 || idx > order[i - 1])), "五个切换按 达人 文案 运营 剪辑 小队 排成一排");
  assert.doesNotMatch(toolbarSource, /D97757/, "账号排行图标去橙");
  assert.doesNotMatch(selfHintSource, /D97757/, "「我」标签去橙");
  assert.match(healthSource, /条作品署名没写全\{canEdit \? " · 去补全" : ""\}/);
  assert.match(source, /const handleSegmentChange = \(next: CollaborationSegment\)/);
});

test("账号排行弹窗接收主页面 year/month，区分历史月份排行与当月实时排行", () => {
  const leaderboardDialogSource = readFileSync(new URL("./leaderboard-dialog.tsx", import.meta.url), "utf8");
  assert.match(leaderboardDialogSource, /实时账号排行/);
  assert.match(leaderboardDialogSource, /\$\{month\}月账号排行/);
  assert.match(source, /<LeaderboardDialog[\s\S]*?year=\{year\}[\s\S]*?month=\{month\}/);
});

test("数据管理抽屉只给组员渲染查看能力：选题库联动回调一律不传", () => {
  // 不传 status / 回调 → 入库、移出选题库按钮在数据管理里永不出现（复用 review_content 才会激活）
  assert.doesNotMatch(source, /onToggleTopicLibrary/);
  assert.doesNotMatch(source, /topicLibraryStatus/);
  // 生命周期与永久删除由 manage_videos 决定，组员为 false
  assert.match(source, /canOperateLifecycle=\{canManageVideos\}/);
  assert.match(source, /canPurge=\{false\}/);
  assert.match(pageSource, /canManageVideos=\{permissionInfo\.permissions\.manage_videos === true\}/);
});

test("作品复盘抽屉的写控件全部在 canOperate 分支内，只读账号拿不到入口", () => {
  assert.match(dialogSource, /canOperateLifecycle = false/);
  assert.match(dialogSource, /canPurge = false/);
  assert.match(dialogSource, /const canOperate = canOperateLifecycle;/);

  const guardIndex = dialogSource.indexOf("{video && canOperate && (");
  assert.ok(guardIndex > 0, "抽屉写操作必须先过 canOperate 分支");

  for (const trigger of [
    "setShowPatch24h(true)",
    'requestConfirmation("restore")',
    'requestConfirmation("purge")',
  ]) {
    assert.ok(
      dialogSource.indexOf(trigger) > guardIndex,
      `${trigger} 必须写在 canOperate 分支内`,
    );
  }
});

test("生命周期写入口靠 manage_videos 兜底，组员的服务端写请求仍被拒", () => {
  const lifecycleSource = readFileSync(
    resolve(process.cwd(), "src/app/api/admin/videos/[videoId]/lifecycle/route.ts"),
    "utf8",
  );
  const lifecycleLibSource = readFileSync(
    resolve(process.cwd(), "src/lib/video-lifecycle.ts"),
    "utf8",
  );

  assert.match(lifecycleSource, /performVideoLifecycleAction/);
  assert.match(lifecycleLibSource, /permissions\.manage_videos !== true/);
});

test("数据管理视频诊断与个人档案卡真·单抽屉内嵌翻页与平滑长宽", () => {
  // 档案卡内嵌作品诊断并支持平滑长宽到 896（max-w-4xl）与缩回 768（max-w-3xl）
  const cardSource = readFileSync(new URL("./personal-card.tsx", import.meta.url), "utf8");
  assert.match(cardSource, /diagnosisDetail \? "max-w-4xl sm:max-w-4xl" : "max-w-3xl sm:max-w-3xl"/);
  assert.match(cardSource, /transition-\[max-width\] duration-240/);
  assert.match(cardSource, /<ContentDetailDialog[\s\S]*renderMode="inline"/);
  assert.match(cardSource, /titlePrefix="个人档案"/);
  assert.match(cardSource, /onBack=\{onCloseDiagnosis\}/);
  // 诊断打开时卡片用 visibility 叠层隐藏而非 display:none，否则 recharts 会被量成 0 尺寸刷控制台告警
  assert.match(cardSource, /diagnosisDetail && "invisible pointer-events-none"/);
  assert.doesNotMatch(cardSource, /diagnosisDetail && "hidden"/);

  // 员工看板直入场景独立使用 sheet 模式
  assert.match(source, /diagnosisDetail && !selectedPersonId/);
  assert.match(source, /titlePrefix="协作管理"/);

  // 标题定名为作品诊断，不再写死视频工作舱，且支持 inline 模式
  assert.match(dialogSource, /作品诊断/);
  assert.doesNotMatch(dialogSource, /视频工作舱/);
  assert.match(dialogSource, /renderMode === "inline"/);
});
