import type { VideoMetricsSnapshot } from "@/types";

export type ReviewScreenshotItem = {
  slot: "curve" | "retention";
  label: "流量与互动截图" | "留存完播截图";
  subLabel: "流量曲线" | "留存脱落";
  url: string;
};

/**
 * 视频复盘真机长屏截图解析器（单一真理源）。
 *
 * 业务事实（防伪与根除历史假象）：
 * 1. 抖音视频复盘固定仅有 2 张业务长屏截图：
 *    - 槽位 1：流量与互动数据截图（流量表现）
 *    - 槽位 2：留存完播脱落截图（留存质量）
 * 2. 数据库快照表中：
 *    - 新版提交统一将全部上传截图保存在 `screenshot_urls` 数组中（[0]=互动图, [1]=留存图）；
 *    - 存量历史数据可能存在 `curve_screenshot_url` / `retention_screenshot_url` 单字段；
 * 3. 根除历史代码中无脑把 curve、retention 与 screenshot_urls 拼接产生克隆重复图、
 *    进而触发“其他补充截图”伪需求的严重设计缺陷。
 *    输出严格去重，最多只输出 2 张真实业务图，绝无任何多余克隆图。
 */
export function resolveReviewScreenshots(
  snapshot: Pick<VideoMetricsSnapshot, "screenshot_urls" | "curve_screenshot_url" | "retention_screenshot_url"> | null | undefined,
): ReviewScreenshotItem[] {
  if (!snapshot) return [];

  const items: ReviewScreenshotItem[] = [];
  const usedUrls = new Set<string>();

  // 1. 流量与互动截图（主图 1）
  // 优先取 curve_screenshot_url，若无则取 screenshot_urls[0]（必须排除 retention）
  let curveUrl: string | null = null;
  if (snapshot.curve_screenshot_url) {
    curveUrl = snapshot.curve_screenshot_url;
  } else if (snapshot.screenshot_urls && snapshot.screenshot_urls.length > 0) {
    if (snapshot.screenshot_urls[0] !== snapshot.retention_screenshot_url) {
      curveUrl = snapshot.screenshot_urls[0];
    } else if (snapshot.screenshot_urls.length > 1) {
      curveUrl = snapshot.screenshot_urls[1];
    }
  }

  if (curveUrl) {
    usedUrls.add(curveUrl);
    items.push({
      slot: "curve",
      label: "流量与互动截图",
      subLabel: "流量曲线",
      url: curveUrl,
    });
  }

  // 2. 留存完播截图（主图 2）
  // 优先取 retention_screenshot_url，若无则取 screenshot_urls 中未使用的另一张
  let retentionUrl: string | null = null;
  if (snapshot.retention_screenshot_url) {
    retentionUrl = snapshot.retention_screenshot_url;
  } else if (snapshot.screenshot_urls) {
    const remain = snapshot.screenshot_urls.find((u) => !usedUrls.has(u));
    if (remain) retentionUrl = remain;
  }

  if (retentionUrl && !usedUrls.has(retentionUrl)) {
    usedUrls.add(retentionUrl);
    items.push({
      slot: "retention",
      label: "留存完播截图",
      subLabel: "留存脱落",
      url: retentionUrl,
    });
  }

  return items;
}
