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

/** 用 App ID + Secret 获取 app_access_token（用于 OAuth 换 token） */
export async function getAppAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID!;
  const appSecret = process.env.FEISHU_APP_SECRET!;

  const resp = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`获取 app_access_token 失败: ${data.msg}`);
  }

  return data.app_access_token;
}

/** 用授权码换取用户信息（含 open_id） */
export async function getFeishuUserInfo(code: string): Promise<{
  open_id: string;
  union_id: string;
  name: string;
  email?: string;
  avatar?: string;
}> {
  const appAccessToken = await getAppAccessToken();

  // 飞书客户端免登码必须走 access_token，而不是网页 OAuth 的 oidc/access_token。
  const tokenResp = await fetch(
    "https://open.feishu.cn/open-apis/authen/v1/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appAccessToken}`,
      },
      body: JSON.stringify({ grant_type: "authorization_code", code }),
    },
  );

  const tokenData = await tokenResp.json();
  if (tokenData.code !== 0) {
    throw new Error(`换取飞书用户身份失败: ${tokenData.msg ?? "未知错误"}`);
  }

  const user = tokenData.data;
  if (!user?.open_id || !user?.union_id || !user?.name) {
    throw new Error("飞书用户身份信息不完整");
  }

  return {
    open_id: user.open_id,
    union_id: user.union_id,
    name: user.name,
    email: user.email,
    avatar: user.avatar_url,
  };
}
