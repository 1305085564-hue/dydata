// 实际连接腾讯云 CloudBase，目录名是历史遗留。
import test from "node:test";
import assert from "node:assert/strict";

import { createAdminClient } from "./admin";

test("CloudBase 服务端密钥齐全时创建管理员客户端", () => {
  const oldKey = process.env.CLOUDBASE_SERVICE_API_KEY;
  process.env.CLOUDBASE_SERVICE_API_KEY = "cloudbase-service-key";
  try {
    assert.ok(createAdminClient().auth);
  } finally {
    if (oldKey === undefined) delete process.env.CLOUDBASE_SERVICE_API_KEY;
    else process.env.CLOUDBASE_SERVICE_API_KEY = oldKey;
  }
});

test("缺少 CloudBase 服务端密钥时抛出明确错误", () => {
  const oldKey = process.env.CLOUDBASE_SERVICE_API_KEY;
  delete process.env.CLOUDBASE_SERVICE_API_KEY;
  try {
    assert.throws(() => createAdminClient(), /Missing CLOUDBASE_SERVICE_API_KEY/);
  } finally {
    if (oldKey === undefined) delete process.env.CLOUDBASE_SERVICE_API_KEY;
    else process.env.CLOUDBASE_SERVICE_API_KEY = oldKey;
  }
});
