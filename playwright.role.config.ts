import { defineConfig, devices } from "@playwright/test";
import { assertGateEnvironment } from "./scripts/assert-local-gate-env.mjs";

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

// 直接跑 `playwright test --config` 也要过环境预检：设了外部 base URL 却没显式授权时，
// 门禁会在"指向生产的构建 + 外部地址"上照常全绿，那种绿灯不构成上线证据。
assertGateEnvironment();

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
        // 默认不复用：端口上先起的陌生服务端（例如在门禁之外用生产 env 构建后
        // 手工起来的 3100）会让整轮门禁在错环境里跑，出现假红/假绿。
        // 确知端口上就是本次要测的构建时，用 DYDATA_GATE_REUSE=1 显式复用。
        reuseExistingServer: process.env.DYDATA_GATE_REUSE === "1",
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
