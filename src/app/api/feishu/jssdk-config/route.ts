import { NextResponse } from "next/server";

import { getAppAccessToken } from "@/lib/feishu/client";

/**
 * 飞书 JSSDK 鉴权签名接口
 *
 * 前端加载飞书 JSSDK 后，需要调用 h5sdk.config() 进行鉴权
 * 本接口生成 config 所需的 timestamp、nonceStr、signature
 */

// jsapi_ticket 内存缓存（有效期 2 小时）
let ticketCache: { ticket: string; expiresAt: number } | null = null;

async function getJsapiTicket(): Promise<string> {
  const now = Date.now();

  if (ticketCache && ticketCache.expiresAt > now) {
    return ticketCache.ticket;
  }

  const appAccessToken = await getAppAccessToken();
  const resp = await fetch(
    "https://open.feishu.cn/open-apis/jssdk/ticket/get",
    {
      headers: { Authorization: `Bearer ${appAccessToken}` },
    },
  );

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`获取 jsapi_ticket 失败: ${data.msg}`);
  }

  const ticket = data.data.ticket as string;
  const expire = data.data.expire as number;

  // 提前 5 分钟过期
  ticketCache = {
    ticket,
    expiresAt: now + (expire - 300) * 1000,
  };

  return ticket;
}

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string };

    if (!url) {
      return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
    }

    const ticket = await getJsapiTicket();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    // SHA1 签名
    const signStr = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signatureBuffer = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(signStr),
    );
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return NextResponse.json({
      appId: process.env.FEISHU_APP_ID,
      timestamp,
      nonceStr,
      signature,
    });
  } catch (err) {
    console.error("[飞书JSSDK] 签名生成失败:", err);
    return NextResponse.json(
      { error: "签名生成失败" },
      { status: 500 },
    );
  }
}
