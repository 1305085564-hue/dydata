import * as lark from "@larksuiteoapi/node-sdk";

let _client: lark.Client | null = null;

/**
 * 飞书开放平台 SDK 客户端（单例）
 * 自动管理 tenant_access_token 的获取和刷新
 */
export function getFeishuClient(): lark.Client {
  if (_client) return _client;

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 环境变量");
  }

  _client = new lark.Client({
    appId,
    appSecret,
    appType: lark.AppType.SelfBuild,
    disableTokenCache: false,
  });

  return _client;
}
