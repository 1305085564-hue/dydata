import { test, expect } from "@playwright/test";

test("初始化不重复取列表，回程视频详情保持打开且关闭后不复活", async ({ page }) => {
  const email = process.env.DYDATA_E2E_OWNER_EMAIL ?? process.env.DYDATA_E2E_EMAIL ?? process.env.DYDATA_TEST_LEADER_EMAIL;
  const password = process.env.DYDATA_E2E_OWNER_PASSWORD ?? process.env.DYDATA_E2E_PASSWORD ?? process.env.DYDATA_TEST_LEADER_PASSWORD;
  if (!email || !password) throw new Error("缺少本地回程验收账号");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([page.waitForURL("**/dashboard"), page.locator('button[type="submit"]').click()]);
  const response = await page.request.get("/api/admin/content/list?view=all&scope=team");
  expect(response.status()).toBe(200);
  const data = await response.json();
  const video = data.videos[0];
  expect(video, "隔离库必须有真实可见的视频样本").toBeTruthy();
  await page.goto("/admin/content");
  await page.locator('[data-content-ready="true"]').waitFor();
  const onboarding = page.getByRole("button", { name: "知道了，开始复盘" });
  if (await onboarding.isVisible()) await onboarding.click();

  let listRequests = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/admin/content/list") listRequests++;
  });
  await page.goto(`/admin/content?videoId=${encodeURIComponent(video.id)}`);
  await page.locator('[data-content-ready="true"]').waitFor();
  await expect(page.getByRole("dialog").getByRole("button", { name: "复制文案", exact: true })).toBeVisible();
  expect(listRequests, "服务端已有列表，初始化和 effect 重放不应再请求列表").toBe(0);
  expect(new URL(page.url()).searchParams.get("videoId")).toBe(video.id);

  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(video.published_at ?? Date.now()));
  const [year, month] = date.split("-");
  const params = new URLSearchParams({ year, month: String(Number(month)), tab: "writers",
    personId: video.accounts?.profile_id ?? video.user_id, from: "video", videoId: video.id });
  await page.goto(`/admin/collaboration?${params}`);
  await page.getByRole("link", { name: /返回该视频复盘/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "复制文案", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("videoId")).toBe(video.id);
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  expect(new URL(page.url()).searchParams.has("videoId")).toBe(false);
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
});
