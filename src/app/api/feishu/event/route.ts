import { NextResponse } from "next/server";

// Edge Runtime：零冷启动，确保 3 秒内响应
export const runtime = "edge";

/**
 * 飞书事件回调接口
 *
 * 职责：
 * 1. 处理飞书 URL 验证（challenge 回显）—— 3 秒内必须返回
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
  challenge?: string;
  token?: string;
  type?: string;
}

/** 用 Web Crypto API 解密飞书加密事件（Edge Runtime 兼容） */
async function decryptEvent(encrypt: string): Promise<FeishuEventBody> {
  const keyStr = process.env.FEISHU_APP_ENCRYPT_KEY!;
  const keyData = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keyStr),
  );

  const buf = Uint8Array.from(atob(encrypt), (c) => c.charCodeAt(0));
  const iv = buf.slice(0, 16);
  const data = buf.slice(16);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    data,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

/** 处理接收到的机器人消息（异步，不阻塞响应） */
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
      // 动态导入飞书 SDK（Edge 不支持 require）
      const { getFeishuClient } = await import("@/lib/feishu/client");
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
    return new Response('{"code":0}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── URL 验证（challenge）── 最高优先级，必须在 3 秒内返回
  if (body.type === "url_verification" && body.challenge) {
    console.log("[飞书] URL 验证 challenge:", body.challenge);
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 加密事件解密 ──
  if (body.encrypt) {
    try {
      body = await decryptEvent(body.encrypt);
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

  // ── 处理事件（异步，不阻塞响应） ──
  const eventType = body.header?.event_type;
  console.log("[飞书] 收到事件:", eventType);

  switch (eventType) {
    case "im.message.receive_v1":
      // 用 waitUntil 让事件处理在响应发送后继续
      handleMessageEvent(body.event ?? {});
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
