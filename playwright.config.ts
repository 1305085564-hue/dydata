import { defineConfig, devices } from "@playwright/test";

// 禁止失败时自动抓取页面可访问性快照，避免测试业务数据进入 error-context.md。
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const configuredBaseUrl = process.env.DYDATA_E2E_BASE_URL?.trim();
const baseURL = configuredBaseUrl || "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/performance",
  outputDir: "test-results/performance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
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
        command: "npm run start -- -p 3100",
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
