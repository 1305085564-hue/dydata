import assert from "node:assert/strict";
import test from "node:test";
import { cutoverMaintenanceResponse, isApplicationMiddlewarePath } from "./cutover-maintenance";

test("maintenance closes all dynamic routes including callbacks, cron and previously unmatched Server Actions", async () => {
  for (const pathname of ["/", "/login", "/api/video-submit", "/api/cron/douyin-sync", "/api/feishu/event", "/topics", "/people/a", "/auth/callback", "/api/health/fake"]) {
    const response = cutoverMaintenanceResponse(pathname, true)!;
    assert.equal(response.status, 503, pathname);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-dydata-maintenance"), "1");
    assert.match(await response.text(), /请勿重复提交/);
  }
  assert.equal(cutoverMaintenanceResponse("/api/health", true), null);
});

test("maintenance default is off and explicit off keeps every old route accessible", () => {
  for (const pathname of ["/login", "/api/video-submit", "/topics", "/auth/callback"]) {
    assert.equal(cutoverMaintenanceResponse(pathname, false), null);
  }
});

test("global maintenance matcher does not broaden normal session or rate-limit coverage", () => {
  for (const pathname of ["/", "/login", "/register", "/forgot-password", "/auth/logout", "/dashboard", "/dashboard/a", "/admin/x", "/api/cron/a", "/violations", "/content-tools", "/douyin/a"]) {
    assert.equal(isApplicationMiddlewarePath(pathname), true, pathname);
  }
  for (const pathname of ["/topics", "/people/a", "/reset-password", "/auth/callback", "/administrator", "/login/fake", "/api-other"]) {
    assert.equal(isApplicationMiddlewarePath(pathname), false, pathname);
  }
});
