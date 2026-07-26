import { NextResponse } from "next/server";

import { getFeishuClient } from "@/lib/feishu/client";

/**
 * 飞书事件回调接口
 *
 * 职责：
 * 1. 处理飞书 URL 验证（challenge 回显）—— 应用首次配置回调地址时触发
 * 2. 接收机器人消息事件（im.message.receive_v1）
 */

interface FeishuEventBody {
  schema?: string;
  header?: {
    event_id: string;
    event_type: string;
    token: string;
    create_time: string;
  };
  event?: Record<string, unknown>;
  encrypt?: string;
  // challenge 字段
  challenge?: string;
  token?: string;
  type?: string;
}

/** 用 AES-256-CBC 解密飞书加密事件 */
function decryptEvent(encrypt: string): FeishuEventBody {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const key = process.env.FEISHU_APP_ENCRYPT_KEY!;

  const keyHash = crypto.createHash("sha256").update(key).digest();
  const buf = Buffer.from(encrypt, "base64");
  const iv = buf.subarray(0, 16);
  const data = buf.subarray(16);

  const decipher = crypto.createDecipheriv("aes-256-cbc", keyHash, iv);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  return JSON.parse(decrypted.toString("utf-8"));
}

/** 处理接收到的机器人消息 */
async function handleMessageEvent(event: Record<string, unknown>) {
  const message = event.message as Record<string, unknown> | undefined;
  if (!message) return;

  const chatId = message.chat_id as string;
  const messageId = message.message_id as string;
  const messageType = message.message_type as string;
  const senderId = (event.sender as Record<string, unknown>)?.sender_id as Record<string, string> | undefined;
  const openId = senderId?.open_id;

  console.log("[飞书机器人] 收到消息:", { chatId, messageId, messageType, openId });

  if (messageType === "text") {
    try {
      const client = getFeishuClient();
      await client.im.message.reply({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify({ text: "收到！如有需要请联系管理员。" }),
          msg_type: "text",
        },
      });
    } catch (err) {
      console.error("[飞书机器人] 回复消息失败:", err);
    }
  }
}

export async function POST(request: Request) {
  let body: FeishuEventBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 0 });
  }

  // ── URL 验证（challenge）── 最高优先级，直接返回
  if (body.type === "url_verification" && body.challenge) {
    console.log("[飞书] URL 验证 challenge");
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 加密事件解密 ──
  if (body.encrypt) {
    try {
      body = decryptEvent(body.encrypt);
    } catch (err) {
      console.error("[飞书] 解密失败:", err);
      return NextResponse.json({ code: 0 });
    }
  }

  // ── 验证 token ──
  const verifyToken = process.env.FEISHU_APP_VERIFICATION_TOKEN;
  const eventToken = body.header?.token ?? body.token;
  if (verifyToken && eventToken && eventToken !== verifyToken) {
    console.warn("[飞书] token 验证失败");
    return NextResponse.json({ code: 0 });
  }

  // ── 处理事件 ──
  const eventType = body.header?.event_type;
  console.log("[飞书] 收到事件:", eventType);

  switch (eventType) {
    case "im.message.receive_v1":
      await handleMessageEvent(body.event ?? {});
      break;

    case "im.chat.member.bot.added_v1":
      console.log("[飞书] 机器人被加入群聊");
      break;

    default:
      console.log("[飞书] 未处理的事件类型:", eventType);
  }

  return NextResponse.json({ code: 0 });
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "feishu-event-callback" });
}
