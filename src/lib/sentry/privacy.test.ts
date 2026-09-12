import assert from "node:assert/strict";
import test from "node:test";

import { dropSentryBreadcrumb, getSentryEnvironment, sanitizeSentryEvent } from "./privacy";

test("Sentry 事件只保留排查错误所需的安全字段", () => {
  const event = {
    event_id: "event-1",
    environment: "production",
    release: "dydata@build-1",
    request: {
      url: "https://dydata.cc/admin/content?videoId=00000000-0000-0000-0000-000000000000",
      headers: { authorization: "Bearer must-not-leak" },
      cookies: { session: "must-not-leak" },
      data: { report: "日报正文不得上传" },
      query_string: "email=person@example.com",
    },
    user: {
      id: "employee-1",
      email: "person@example.com",
      username: "阿禅",
      ip_address: "203.0.113.1",
    },
    extra: { prompt: "AI 提示词不得上传" },
    contexts: { device: { model: "private-device" } },
    breadcrumbs: [{ category: "fetch", data: { url: "/api/video?token=secret" } }],
    message: "错误里也不允许带用户输入",
    transaction: "/admin/content?videoId=00000000-0000-0000-0000-000000000000",
    tags: {
      "dydata.boundary": "dashboard",
      email: "person@example.com",
      role: "company_owner",
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "日报正文不得上传",
          stacktrace: {
            frames: [
              {
                filename: "https://dydata.cc/_next/app.js?token=secret",
                function: "loadDashboard",
                vars: { password: "must-not-leak" },
              },
            ],
          },
        },
      ],
    },
  };

  const sanitized = sanitizeSentryEvent(event);

  assert.equal(sanitized.event_id, "event-1");
  assert.equal(sanitized.environment, "production");
  assert.equal(sanitized.release, "dydata@build-1");
  assert.deepEqual(sanitized.request, { url: "https://dydata.cc/admin/content" });
  assert.equal(sanitized.user, undefined);
  assert.equal(sanitized.extra, undefined);
  assert.equal(sanitized.contexts, undefined);
  assert.equal(sanitized.breadcrumbs, undefined);
  assert.equal(sanitized.message, undefined);
  assert.equal(sanitized.transaction, "/admin/content");
  assert.deepEqual(sanitized.tags, { "dydata.boundary": "dashboard" });
  assert.equal(sanitized.exception?.values?.[0]?.value, undefined);
  assert.equal(
    sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename,
    "https://dydata.cc/_next/app.js",
  );
  assert.equal(sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars, undefined);
  assert.equal(event.request.headers.authorization, "Bearer must-not-leak");
});

test("Sentry 不保留任何用户行为面包屑", () => {
  assert.equal(dropSentryBreadcrumb(), null);
});

test("Sentry 环境优先使用浏览器和服务端都能读取的公开环境名", () => {
  const previousPublicEnvironment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
  const previousServerEnvironment = process.env.SENTRY_ENVIRONMENT;
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = "preview";
  process.env.SENTRY_ENVIRONMENT = "production";

  try {
    assert.equal(getSentryEnvironment(), "preview");
  } finally {
    if (previousPublicEnvironment === undefined) {
      delete process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
    } else {
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = previousPublicEnvironment;
    }
    if (previousServerEnvironment === undefined) {
      delete process.env.SENTRY_ENVIRONMENT;
    } else {
      process.env.SENTRY_ENVIRONMENT = previousServerEnvironment;
    }
  }
});
