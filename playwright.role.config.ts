import { defineConfig, devices } from "@playwright/test";

/**
 * 真实角色定向验收专用配置（2026-09-26 建）。
 *
 * 与 playwright.config.ts（全站性能/首屏门禁，testDir=./tests/performance）分开：
 * 本配置只跑 tests/roles 下的角色可见性/权限边界场景，不并入 `npm run gate:browser`，
 * 避免把定向验收扩大成全站门禁。
 *
 * 运行：npm run gate:roles（凭据从 .env.ai-test.local 读取，不写进仓库）
 */

process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const configuredBaseUrl = process.env.DYDATA_E2E_BASE_URL?.trim();
const baseURL = configuredBaseUrl || "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/roles",
  outputDir: "test-results/roles",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: configuredBaseUrl
    ? undefined
    : {
        // Playwright's --env-file only configures the test runner. Load the
        // same local-only fixture env in the Next server process as well.
        // Disable IP rate limiting in local role-gate testing to prevent 429 flaky timeouts across 23 fast sequential specs.
        command: "npm run seed:roles && RATE_LIMIT_DISABLED=true node --env-file-if-exists=.env.ai-test.local scripts/run-role-gate-server.mjs",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
