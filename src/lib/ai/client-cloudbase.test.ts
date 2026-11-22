import test from "node:test";
import assert from "node:assert/strict";

import { __internal } from "./client";

async function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  __internal.setServiceClientForTests(null);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __internal.setServiceClientForTests(null);
  }
}

test("CloudBase AI data access uses the adapted admin client", async () => {
  await withEnv({
    CLOUDBASE_ENV_ID: "health-test-env",
    CLOUDBASE_SERVICE_API_KEY: "cloudbase-test-service-key",
    AI_API_KEY: "ai-provider-key-is-not-a-db-key",
  }, () => {
    const client = __internal.getServiceClient() as { from?: unknown } | null;
    assert.equal(typeof client?.from, "function");
  });
});

test("CloudBase AI data access does not use AI_API_KEY when the database service key is missing", async () => {
  await withEnv({
    CLOUDBASE_ENV_ID: "health-test-env",
    CLOUDBASE_SERVICE_API_KEY: undefined,
    AI_API_KEY: "ai-provider-key-is-not-a-db-key",
  }, () => assert.equal(__internal.getServiceClient(), null));
});
