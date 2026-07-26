import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import test from "node:test";

import { POST } from "./route";

const encryptKey = "feishu-route-test-encrypt-key";

/** 构造一个会触发消息处理的业务事件请求体 */
function buildMessageEventRequest(overrides?: { token?: string; headerToken?: string }) {
  const token = overrides?.token ?? "correct-token";
  const headerToken = overrides?.headerToken ?? token;
  return new Request("https://dydata.cc/api/feishu/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      header: {
        event_id: "ev_test",
        event_type: "im.message.receive_v1",
        token: headerToken,
        create_time: String(Date.now()),
      },
      event: {
        message: {
          chat_id: "oc_test",
          message_id: "om_test",
          message_type: "text",
        },
        sender: { sender_id: { open_id: "ou_test" } },
      },
      token,
    }),
  });
}

function encryptEvent(body: Record<string, string>) {
  const iv = Buffer.alloc(16, 7);
  const cipher = createCipheriv(
    "aes-256-cbc",
    createHash("sha256").update(encryptKey).digest(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(body), "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([iv, encrypted]).toString("base64");
}

test("回显未加密的飞书 URL 验证 challenge", async () => {
  const response = await POST(new Request("https://dydata.cc/api/feishu/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "url_verification", challenge: "plain-challenge" }),
  }));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { challenge: "plain-challenge" });
});

test("回显加密的飞书 URL 验证 challenge", async () => {
  const previousKey = process.env.FEISHU_APP_ENCRYPT_KEY;
  process.env.FEISHU_APP_ENCRYPT_KEY = encryptKey;

  try {
    const response = await POST(new Request("https://dydata.cc/api/feishu/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encrypt: encryptEvent({ type: "url_verification", challenge: "encrypted-challenge" }),
      }),
    }));

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.deepEqual(await response.json(), { challenge: "encrypted-challenge" });
  } finally {
    if (previousKey === undefined) delete process.env.FEISHU_APP_ENCRYPT_KEY;
    else process.env.FEISHU_APP_ENCRYPT_KEY = previousKey;
  }
});

test("VERIFICATION_TOKEN 未配置时，业务事件不进入消息处理", async (t) => {
  const previousToken = process.env.FEISHU_APP_VERIFICATION_TOKEN;
  delete process.env.FEISHU_APP_VERIFICATION_TOKEN;

  const logs: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => {
    logs.push(String(args[0]));
  });

  try {
    const response = await POST(buildMessageEventRequest());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { code: 0 });
    // 不应出现消息处理日志
    assert.equal(logs.some((l) => l.includes("[飞书机器人] 收到消息")), false);
  } finally {
    if (previousToken === undefined) delete process.env.FEISHU_APP_VERIFICATION_TOKEN;
    else process.env.FEISHU_APP_VERIFICATION_TOKEN = previousToken;
  }
});

test("请求缺少 token 时，业务事件不进入消息处理", async (t) => {
  const previousToken = process.env.FEISHU_APP_VERIFICATION_TOKEN;
  process.env.FEISHU_APP_VERIFICATION_TOKEN = "correct-token";

  const logs: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => {
    logs.push(String(args[0]));
  });

  try {
    const response = await POST(buildMessageEventRequest({ token: "", headerToken: "" }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { code: 0 });
    // 不应出现消息处理日志
    assert.equal(logs.some((l) => l.includes("[飞书机器人] 收到消息")), false);
  } finally {
    if (previousToken === undefined) delete process.env.FEISHU_APP_VERIFICATION_TOKEN;
    else process.env.FEISHU_APP_VERIFICATION_TOKEN = previousToken;
  }
});

test("token 错误时，业务事件不进入消息处理", async (t) => {
  const previousToken = process.env.FEISHU_APP_VERIFICATION_TOKEN;
  process.env.FEISHU_APP_VERIFICATION_TOKEN = "correct-token";

  const logs: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => {
    logs.push(String(args[0]));
  });

  try {
    const response = await POST(buildMessageEventRequest({ token: "wrong-token" }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { code: 0 });
    // 不应出现消息处理日志
    assert.equal(logs.some((l) => l.includes("[飞书机器人] 收到消息")), false);
  } finally {
    if (previousToken === undefined) delete process.env.FEISHU_APP_VERIFICATION_TOKEN;
    else process.env.FEISHU_APP_VERIFICATION_TOKEN = previousToken;
  }
});

test("token 校验失败时返回稳定响应，不泄露内部配置", async (t) => {
  const previousToken = process.env.FEISHU_APP_VERIFICATION_TOKEN;
  process.env.FEISHU_APP_VERIFICATION_TOKEN = "correct-token";

  const errors: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    errors.push(String(args[0]));
  });

  try {
    const response = await POST(buildMessageEventRequest({ token: "wrong-token" }));

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { code: 0 });
    // 响应不应包含 token 值
    assert.equal(JSON.stringify(body).includes("correct-token"), false);
    assert.equal(JSON.stringify(body).includes("wrong-token"), false);
  } finally {
    if (previousToken === undefined) delete process.env.FEISHU_APP_VERIFICATION_TOKEN;
    else process.env.FEISHU_APP_VERIFICATION_TOKEN = previousToken;
  }
});
