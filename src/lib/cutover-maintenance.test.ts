import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { cutoverMaintenanceResponse, isApplicationMiddlewarePath } from "./cutover-maintenance";

const VALID_TOKEN = randomBytes(32).toString("base64url");

function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => void,
) {
  const previousValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createProbeRequest(url: string, token?: string) {
  const headers = token ? { "x-dydata-cutover-probe": token } : undefined;
  return { url, headers: new Headers(headers) };
}

function futureExpiry(minutes = 30) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

test("maintenance closes all dynamic routes and keeps health available", async () => {
  for (const pathname of ["/", "/login", "/api/video-submit", "/api/cron/douyin-sync", "/api/feishu/event", "/topics", "/people/a", "/auth/callback", "/api/health/fake"]) {
    const response = cutoverMaintenanceResponse(pathname, true)!;
    assert.equal(response.status, 503, pathname);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-dydata-maintenance"), "1");
    assert.match(await response.text(), /请勿重复提交/);
  }
  assert.equal(cutoverMaintenanceResponse("/api/health", true), null);
});

test("freeze environment defaults to maintenance when enabled", () => {
  withEnvironment({
    DYDATA_WRITE_FREEZE: "1",
    DYDATA_CUTOVER_PROBE_TOKEN: undefined,
    DYDATA_CUTOVER_PROBE_EXPIRES_AT: undefined,
  }, () => {
    assert.equal(cutoverMaintenanceResponse("/api/video-submit")?.status, 503);
    assert.equal(cutoverMaintenanceResponse("/api/health"), null);
  });
});

test("a valid private probe for either exact HTTPS host bypasses maintenance", () => {
  withEnvironment({
    DYDATA_CUTOVER_PROBE_TOKEN: VALID_TOKEN,
    DYDATA_CUTOVER_PROBE_EXPIRES_AT: futureExpiry(),
  }, () => {
    for (const url of ["https://dydata.cc/api/video-submit", "https://direct.dydata.cc/api/video-submit"]) {
      assert.equal(cutoverMaintenanceResponse("/api/video-submit", true, createProbeRequest(url, VALID_TOKEN)), null);
    }
  });
});

test("missing or incorrect probe headers stay in maintenance; URL and cookie values do not authorize", () => {
  withEnvironment({
    DYDATA_CUTOVER_PROBE_TOKEN: VALID_TOKEN,
    DYDATA_CUTOVER_PROBE_EXPIRES_AT: futureExpiry(),
  }, () => {
    const withoutHeader = new Request(`https://dydata.cc/?x-dydata-cutover-probe=${VALID_TOKEN}`, {
      headers: { cookie: `x-dydata-cutover-probe=${VALID_TOKEN}` },
    });
    for (const request of [
      createProbeRequest("https://dydata.cc/api/video-submit"),
      createProbeRequest("https://dydata.cc/api/video-submit", `${VALID_TOKEN}wrong`),
      withoutHeader,
    ]) {
      assert.equal(cutoverMaintenanceResponse("/api/video-submit", true, request)?.status, 503);
    }
  });
});

test("wrong domains, schemes, ports, and URL credentials stay in maintenance", () => {
  withEnvironment({
    DYDATA_CUTOVER_PROBE_TOKEN: VALID_TOKEN,
    DYDATA_CUTOVER_PROBE_EXPIRES_AT: futureExpiry(),
  }, () => {
    for (const url of [
      "http://dydata.cc/api/video-submit",
      "https://example.com/api/video-submit",
      "https://dydata.cc.example.com/api/video-submit",
      "https://dydata.cc:8443/api/video-submit",
      "https://user@dydata.cc/api/video-submit",
    ]) {
      assert.equal(cutoverMaintenanceResponse("/api/video-submit", true, createProbeRequest(url, VALID_TOKEN))?.status, 503, url);
    }
  });
});

test("missing, malformed, expired, or overlong expiry configuration rejects probes", () => {
  const request = createProbeRequest("https://dydata.cc/api/video-submit", VALID_TOKEN);
  for (const expiresAt of [
    undefined,
    "not-a-timestamp",
    new Date(Date.now() - 1_000).toISOString(),
    new Date(Date.now() + 4 * 60 * 60 * 1000 + 60_000).toISOString(),
    "2026-02-30T12:00:00.000Z",
  ]) {
    withEnvironment({
      DYDATA_CUTOVER_PROBE_TOKEN: VALID_TOKEN,
      DYDATA_CUTOVER_PROBE_EXPIRES_AT: expiresAt,
    }, () => {
      assert.equal(cutoverMaintenanceResponse("/api/video-submit", true, request)?.status, 503, String(expiresAt));
    });
  }
});

test("revoking either probe environment value immediately restores the maintenance response", () => {
  const request = createProbeRequest("https://dydata.cc/api/video-submit", VALID_TOKEN);
  const expiresAt = futureExpiry();

  withEnvironment({
    DYDATA_CUTOVER_PROBE_TOKEN: undefined,
    DYDATA_CUTOVER_PROBE_EXPIRES_AT: expiresAt,
  }, () => {
    assert.equal(cutoverMaintenanceResponse("/api/video-submit", true, request)?.status, 503);
  });
  withEnvironment({
    DYDATA_CUTOVER_PROBE_TOKEN: VALID_TOKEN,
    DYDATA_CUTOVER_PROBE_EXPIRES_AT: undefined,
  }, () => {
    assert.equal(cutoverMaintenanceResponse("/api/video-submit", true, request)?.status, 503);
  });
});

test("freeze off keeps normal behavior even if probe configuration is absent", () => {
  withEnvironment({
    DYDATA_WRITE_FREEZE: "0",
    DYDATA_CUTOVER_PROBE_TOKEN: undefined,
    DYDATA_CUTOVER_PROBE_EXPIRES_AT: undefined,
  }, () => {
    assert.equal(cutoverMaintenanceResponse("/api/video-submit", undefined, createProbeRequest("https://dydata.cc/api/video-submit")), null);
    assert.equal(cutoverMaintenanceResponse("/api/video-submit", false), null);
  });
});

test("global maintenance matcher does not broaden normal session or rate-limit coverage", () => {
  for (const pathname of ["/", "/login", "/register", "/forgot-password", "/auth/logout", "/dashboard", "/dashboard/a", "/admin/x", "/api/cron/a", "/violations", "/content-tools", "/douyin/a"]) {
    assert.equal(isApplicationMiddlewarePath(pathname), true, pathname);
  }
  for (const pathname of ["/topics", "/people/a", "/reset-password", "/auth/callback", "/administrator", "/login/fake", "/api-other"]) {
    assert.equal(isApplicationMiddlewarePath(pathname), false, pathname);
  }
});
