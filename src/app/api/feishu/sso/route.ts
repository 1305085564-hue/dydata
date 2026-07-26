import { NextResponse } from "next/server";

import { getFeishuUserInfo } from "@/lib/feishu/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 飞书 SSO 免登接口
 *
 * 流程：
 * 1. 前端通过飞书 JSSDK 获取授权码 (auth code)
 * 2. 前端将授权码 POST 到本接口
 * 3. 后端用授权码换取飞书用户信息（含 open_id）
 * 4. 用 open_id 查 profiles 表匹配已有用户
 * 5. 生成 Supabase magic link token 返回给前端
 * 6. 前端用 verifyOtp 创建 session → 自动登录
 */

export async function POST(request: Request) {
  try {
    const { code } = (await request.json()) as { code?: string };

    if (!code) {
      return NextResponse.json(
        { error: "缺少授权码" },
        { status: 400 },
      );
    }

    // 1. 用授权码换取飞书用户信息
    let feishuUser;
    try {
      feishuUser = await getFeishuUserInfo(code);
    } catch (err) {
      console.error("[飞书SSO] 获取用户信息失败:", err);
      return NextResponse.json(
        { error: "飞书授权失败，请重试" },
        { status: 401 },
      );
    }

    console.log("[飞书SSO] 用户登录:", feishuUser.name, feishuUser.open_id);

    // 2. 用 open_id 查 profiles 表
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, name, role")
      .eq("feishu_open_id", feishuUser.open_id)
      .single();

    if (profileError || !profile) {
      console.warn("[飞书SSO] 未匹配到用户:", feishuUser.open_id, feishuUser.name);
      return NextResponse.json(
        {
          error: "未找到关联账号",
          hint: "请联系管理员在系统中绑定你的飞书账号",
          feishu_name: feishuUser.name,
        },
        { status: 404 },
      );
    }

    const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
    const email = authUserData.user?.email;

    if (authUserError || !email) {
      console.error("[飞书SSO] 读取账号邮箱失败:", authUserError?.message ?? "邮箱为空");
      return NextResponse.json(
        { error: "登录账号邮箱不可用，请联系管理员" },
        { status: 500 },
      );
    }

    // 3. 生成 magic link token（不发送邮件，只拿 token）
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkError || !linkData) {
      console.error("[飞书SSO] 生成 token 失败:", linkError);
      return NextResponse.json(
        { error: "登录失败，请稍后重试" },
        { status: 500 },
      );
    }

    const hashedToken = linkData.properties?.hashed_token;

    if (!hashedToken) {
      console.error("[飞书SSO] 未获取到 hashed_token");
      return NextResponse.json(
        { error: "登录失败，请稍后重试" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      hashed_token: hashedToken,
      user: {
        id: profile.id,
        name: profile.name,
        role: profile.role,
      },
    });
  } catch (err) {
    console.error("[飞书SSO] 异常:", err);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
}
