import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隐私政策 - DYData 数据分析小站",
  description: "数据分析小站的隐私政策与数据处理说明。",
  alternates: {
    canonical: "/privacy",
  },
};

const effectiveDate = "2026年11月14日";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen min-h-dvh bg-[#FCFCFB] text-[#1F1E1D]">
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-[#E2E2DF] pb-6">
          <Link href="/" prefetch={false} className="text-[20px] font-normal tracking-tight text-[#141413]">
            DYData
          </Link>
          <Link
            href="/"
            prefetch={false}
            className="text-[13px] text-[#78716C] transition-colors hover:text-[#141413]"
          >
            返回首页
          </Link>
        </header>

        <article className="mx-auto max-w-3xl py-10">
          <div className="border-b border-[#E2E2DF] pb-6">
            <h1 className="text-[28px] font-normal tracking-tight text-[#141413] sm:text-[28px]">
              隐私政策
            </h1>
            <p className="mt-3 text-[13px] text-[#78716C]">生效日期：{effectiveDate}</p>
          </div>

          <div className="mt-8 space-y-8 text-[14px] leading-[1.85] text-[#1F1E1D]">
            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">一、服务说明</h2>
              <p>
                本隐私政策适用于 dydata.cc（以下简称“本网站”）及其提供的“数据分析小站”服务。本网站是面向小团队内部成员的非公开工具，注册时需选择并申请加入团队，并由团队管理员审批，不是面向公众开放的社区。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">二、我们收集的数据</h2>
              <p>为提供团队协作、作品复盘和账号管理服务，我们收集以下数据：</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>账号信息：姓名、邮箱、登录凭据（密码由认证服务加密处理，平台不保存明文）、所属团队与角色。</li>
                <li>团队协作数据：小组成员、加入申请、邀请码、权限资格、审批记录。</li>
                <li>内容生产数据：选题与子选题认领、作品截图（抖音后台截图）、作品播放/互动/留存指标、日报与组长日报、SOP 检查项、审核评分、反馈卡与知识案例。</li>
                <li>抖音账号绑定：OAuth 授权信息、账号标识、同步的作品与指标。</li>
                <li>AI 功能数据：用户提交的改写文本、提示词、生成记录。</li>
                <li>运行日志：操作审计、OCR 识别记录、提醒发送记录、性能与使用事件。</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">三、数据使用目的与共享</h2>
              <p>
                我们使用上述数据开展团队内部选题管理、作品数据复盘、账号与权限管理、提醒通知和故障排查。不做广告投放，不做用户画像，不向任何第三方出售或出租个人信息。
              </p>
              <p>
                生产环境启用的第三方服务包括 Supabase（数据库与认证）、腾讯云 COS（截图私有存储）、Vercel（网站托管）、Sentry（错误监控）、百度 OCR（截图文字识别）、团队自行配置的 AI 模型服务和飞书（提醒通知）。这些服务仅在实现对应功能所需的范围内处理数据。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">四、保存期限与安全措施</h2>
              <p>
                数据在账号存续期间保存。账号注销后 30 日内删除或匿名化，法律法规要求留存的审计记录除外。我们通过访问权限控制、传输加密、私有存储和操作审计等措施保护数据安全。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">五、你的权利</h2>
              <p>
                你可以查询、更正、删除个人信息，申请注销账号或撤回已授予的授权。请通过 1305085564@qq.com 联系我们，我们将在 15 个工作日内答复。涉及团队业务数据的请求，可能需要由团队管理员确认相应权限。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">六、未成年人保护</h2>
              <p>本服务面向内容团队从业成员，不主动面向未成年人提供。</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">七、政策更新</h2>
              <p>
                政策更新后，我们会在本页面标注新的生效日期。发生重大变更时，我们会在站内进行提示。
              </p>
            </section>
          </div>
        </article>

        <footer className="border-t border-[#E2E2DF] py-8 text-center text-[12px] text-[#78716C]">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/privacy" prefetch={false} className="hover:underline">隐私政策</Link>
            <span>·</span>
            <Link href="/terms" prefetch={false} className="hover:underline">服务条款</Link>
            <span>·</span>
            <Link href="/" prefetch={false} className="hover:underline">返回首页</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
