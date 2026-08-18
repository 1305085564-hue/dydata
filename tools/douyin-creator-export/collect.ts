import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

import { chromium, type Locator, type Page } from "playwright";

import {
  normalizeCreatorName,
  normalizeVideoRows,
  parseArgs,
  parseVideoCard,
  readWorkbookVideoRowCount,
  resolveOutputFilePath,
  writeDouyinExcel,
  type DouyinVideoRow,
} from "./core";

const DEFAULT_PROFILE_DIR = path.resolve("tools/douyin-creator-export/.profile");
const DEFAULT_TEMP_DIR = path.resolve("tools/douyin-creator-export/.tmp");
const DEFAULT_OUTPUT_DIR = path.resolve("output/douyin-exports");

const CARD_READY_TIMEOUT_MS = 15_000;
const AUTO_SCROLL_SETTLE_MS = 5_000;
const AUTO_SCROLL_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.get("url");
  const outputArg = args.get("output") || undefined;
  const profileDir = path.resolve(args.get("profile-dir") || DEFAULT_PROFILE_DIR);
  const tempDir = path.resolve(args.get("temp-dir") || DEFAULT_TEMP_DIR);

  if (!url) {
    throw new Error("缺少 --url。用法：npm run douyin:collect -- --url=https://www.douyin.com/user/...");
  }

  validateDouyinUrl(url);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log(`使用独立浏览器配置：${profileDir}`);
  console.log(`临时目录：${tempDir}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });

  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(45_000);

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);

    await ensureAssistantReady(page);

    const creatorHomeUrl = normalizeDouyinHomeUrl(page.url(), url);
    const creatorName = await inferCreatorName(page);

    console.log(`达人：${creatorName}`);
    console.log(`主页：${creatorHomeUrl}`);

    await clickText(page, "采集本页视频");
    await clickText(page, "自动滚动");
    await waitForCardCountToSettle(page, AUTO_SCROLL_TIMEOUT_MS, AUTO_SCROLL_SETTLE_MS);

    const downloadResult = await attemptDownload(page, tempDir, async () => {
      await clickText(page, "确认采集");
    });

    if (downloadResult) {
      const downloadedRowCount = await readWorkbookVideoRowCount(downloadResult.tempPath).catch(() => 0);
      if (downloadedRowCount > 0) {
        const finalOutput = resolveOutputFilePath({
          output: outputArg,
          creatorName,
          count: downloadedRowCount,
          defaultDir: DEFAULT_OUTPUT_DIR,
        });
        moveFile(downloadResult.tempPath, finalOutput);
        console.log(`已保存插件导出：${finalOutput}`);
        console.log(`视频数：${downloadedRowCount}`);
        return;
      }

      fs.unlinkSync(downloadResult.tempPath);
      console.log("插件导出的 Excel 没有读到视频数据，改走页面兜底。");
    } else {
      console.log("没有捕获到插件下载，改走页面兜底。");
    }

    await closeOverlays(page);
    await loadCardsByScrolling(page);

    const rows = await extractRowsFromPage(page, creatorName, creatorHomeUrl);
    if (rows.length === 0) {
      throw new Error("没有从页面上提取到任何作品卡片");
    }

    const normalizedRows = normalizeVideoRows(rows);
    const finalOutput = resolveOutputFilePath({
      output: outputArg,
      creatorName,
      count: normalizedRows.length,
      defaultDir: DEFAULT_OUTPUT_DIR,
    });
    await writeDouyinExcel(normalizedRows, finalOutput);
    console.log(`已保存兜底 Excel：${finalOutput}`);
    console.log(`视频数：${normalizedRows.length}`);
  } finally {
    await context.close();
  }
}

async function ensureAssistantReady(page: Page) {
  await page.keyboard.press("Alt+C").catch(() => {});
  if (await waitForAssistantInjection(page, CARD_READY_TIMEOUT_MS)) return;

  if (!process.stdin.isTTY) {
    throw new Error("未找到社媒助手注入节点，且当前不是交互终端，无法提示手动登录");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    "浏览器里还没看到社媒助手或抖音登录态。请先在打开的独立 Chrome 里登录并安装社媒助手，然后按回车继续...",
  );
  rl.close();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);
  await page.keyboard.press("Alt+C").catch(() => {});

  if (!(await waitForAssistantInjection(page, CARD_READY_TIMEOUT_MS))) {
    throw new Error("仍未找到社媒助手注入节点，请确认扩展已在独立 profile 中安装");
  }
}

async function waitForAssistantInjection(page: Page, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  const assistant = page.locator("smzs-user");
  const collectButton = page.getByText("采集本页视频", { exact: true });

  while (Date.now() < deadline) {
    if ((await assistant.count().catch(() => 0)) > 0) return true;
    if ((await collectButton.count().catch(() => 0)) > 0) return true;
    await page.waitForTimeout(400);
  }

  return false;
}

async function clickText(page: Page, text: string) {
  const locators: Locator[] = [
    page.getByRole("button", { name: text }),
    page.locator("button").filter({ hasText: text }),
    page.locator('[role="button"]').filter({ hasText: text }),
    page.getByText(text, { exact: true }),
  ];

  const deadline = Date.now() + CARD_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 5); i += 1) {
        const candidate = locator.nth(i);
        if (await candidate.isVisible().catch(() => false)) {
          await candidate.click();
          return;
        }
      }
    }
    await page.waitForTimeout(300);
  }

  throw new Error(`没有找到可点击的「${text}」`);
}

async function waitForCardCountToSettle(page: Page, timeoutMs: number, minWaitMs: number) {
  const start = Date.now();
  let lastCount = -1;
  let stableRounds = 0;

  while (Date.now() - start < timeoutMs) {
    const currentCount = await countVideoAnchors(page);
    if (Date.now() - start >= minWaitMs) {
      if (currentCount === lastCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      if (stableRounds >= 3) return;
    }

    lastCount = currentCount;
    await page.waitForTimeout(1_000);
  }
}

async function attemptDownload(page: Page, tempDir: string, action: () => Promise<void>) {
  const downloadPromise = page
    .waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS })
    .catch(() => null);

  await action();
  const download = await downloadPromise;
  if (!download) return null;

  const suggestedFilename = sanitizeDownloadFilename(download.suggestedFilename());
  const tempPath = path.join(tempDir, `${Date.now()}-${suggestedFilename}`);
  fs.mkdirSync(path.dirname(tempPath), { recursive: true });
  await download.saveAs(tempPath);
  return { tempPath, suggestedFilename };
}

async function countVideoAnchors(page: Page) {
  return page.evaluate(() => {
    const ids = new Set<string>();
    for (const anchor of Array.from(document.querySelectorAll('a[href*="/video/"]'))) {
      const href = (anchor as HTMLAnchorElement).href || "";
      const videoId = href.match(/\/video\/(\d+)/)?.[1];
      if (videoId) ids.add(videoId);
    }
    return ids.size;
  });
}

async function closeOverlays(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);
}

async function loadCardsByScrolling(page: Page) {
  const start = Date.now();
  let previousCount = -1;
  let stableRounds = 0;

  while (Date.now() - start < AUTO_SCROLL_TIMEOUT_MS) {
    const currentCount = await countVideoAnchors(page);
    if (currentCount === previousCount) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }

    if (stableRounds >= 3) return;

    previousCount = currentCount;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1_200);
  }
}

async function extractRowsFromPage(page: Page, creatorName: string, creatorHomeUrl: string) {
  const cards = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
    const seen = new Set<string>();
    const result: Array<{
      href: string;
      text: string;
      titleText: string;
      ariaLabel: string;
    }> = [];

    for (const anchor of anchors) {
      const element = anchor as HTMLAnchorElement;
      const href = element.href || "";
      const videoId = href.match(/\/video\/(\d+)/)?.[1];
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);

      result.push({
        href,
        text: element.innerText || element.textContent || "",
        titleText: element.getAttribute("title") || "",
        ariaLabel: element.getAttribute("aria-label") || "",
      });
    }

    return result;
  });

  const rows: DouyinVideoRow[] = [];
  for (const [index, card] of cards.entries()) {
    const row = parseVideoCard({
      index: index + 1,
      creatorName,
      creatorHomeUrl,
      href: card.href,
      text: card.text,
      titleText: card.titleText,
      altText: card.ariaLabel,
    });
    if (row) rows.push(row);
  }

  return rows;
}

async function inferCreatorName(page: Page) {
  const candidate = await page.evaluate(() => {
    const values = [
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
      document.querySelector("h1")?.textContent || "",
      document.title || "",
    ];

    return values.find((value) => value.trim().length > 0) || "";
  });

  const name = normalizeCreatorName(candidate);
  return name || "抖音达人";
}

function normalizeDouyinHomeUrl(currentUrl: string, fallbackUrl: string) {
  try {
    const url = new URL(currentUrl);
    if (url.hostname.includes("douyin.com")) return url.toString();
  } catch {
    // ignore
  }

  return fallbackUrl;
}

function sanitizeDownloadFilename(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]/g, "-");
}

function moveFile(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) {
    fs.unlinkSync(to);
  }
  fs.renameSync(from, to);
}

function validateDouyinUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`不是有效的 URL：${input}`);
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = ["douyin.com", "www.douyin.com", "v.douyin.com", "iesdouyin.com", "www.iesdouyin.com"];
  const isAllowed = allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
  if (!isAllowed) {
    throw new Error(`只接受抖音链接：${input}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
