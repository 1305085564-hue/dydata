import { NextResponse } from "next/server";

import { getFeishuClient } from "@/lib/feishu/client";

/**
 * 飞书事件回调接口
 *
 * 职责：
 * 1. 处理飞书 URL 验证（challenge 回显）—— 应用首次配置回调地址时触发
 * 2. 接收机器人消息事件（im.message.receive_v1）
 *
 * 飞书后台配置：
 *   事件与回调 → 接收方式 → 使用请求地址接收事件
 *   请求地址：https://dydata.cc/api/feishu/event
 */

// 飞书 URL 验证请求体
interface FeishuChallengeBody {
  challenge: string;
  token: string;
  type: "url_verification";
}

// 飞书事件请求体（v2 格式）
interface FeishuEventBody {
  schema?: string;
  header?: {
    event_id: string;
    event_type: string;
    token: string;
    create_time: string;
  };
  event?: Record<string, unknown>;
  // 加密事件
  encrypt?: string;
}

/** 用 AES-256-CBC 解密飞书加密事件 */
function decryptEvent(encrypt: string): FeishuEventBody {
  const crypto = require("node:crypto");
  const key = process.env.FEISHU_APP_ENCRYPT_KEY!;

  // 飞书用 SHA256(key) 作为 AES 密钥
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

  // 初期只回复确认，后续可接入业务逻辑
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
  try {
    const rawBody = await request.text();
    let body: FeishuEventBody;

    // 检查是否是加密事件
    try {
      const parsed = JSON.parse(rawBody) as FeishuEventBody | FeishuChallengeBody;

      // URL 验证（challenge）
      if ("type" in parsed && parsed.type === "url_verification") {
        const challengeBody = parsed as FeishuChallengeBody;
        console.log("[飞书] URL 验证请求, token:", challengeBody.token);
        return NextResponse.json({ challenge: challengeBody.challenge });
      }

      // 加密事件
      if ("encrypt" in parsed && parsed.encrypt) {
        body = decryptEvent(parsed.encrypt as string);
      } else if ("header" in parsed) {
        body = parsed as FeishuEventBody;
      } else {
        // 不认识的格式，静默返回
        return NextResponse.json({ code: 0 });
      }
    } catch {
      // JSON 解析失败，可能是加密的原始文本
      const encryptKey = process.env.FEISHU_APP_ENCRYPT_KEY;
      if (encryptKey) {
        body = decryptEvent(rawBody);
      } else {
        console.error("[飞书] 无法解析事件体");
        return NextResponse.json({ code: 0 });
      }
    }

    // 验证 token（防伪造请求）
    const verifyToken = process.env.FEISHU_APP_VERIFICATION_TOKEN;
    const eventToken = body.header?.token;
    if (verifyToken && eventToken && eventToken !== verifyToken) {
      console.warn("[飞书] token 验证失败");
      return NextResponse.json({ code: 0 });
    }

    // 处理事件
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

    // 飞书要求返回 code: 0 表示处理成功
    return NextResponse.json({ code: 0 });
  } catch (err) {
    console.error("[飞书] 事件处理异常:", err);
    // 仍然返回 200 + code: 0，避免飞书重试导致更多错误
    return NextResponse.json({ code: 0 });
  }
}

// 飞书也可能会用 GET 请求验证连通性
export async function GET() {
  return NextResponse.json({ status: "ok", service: "feishu-event-callback" });
}
