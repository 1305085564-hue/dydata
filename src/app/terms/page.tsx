import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "服务条款 - DYData 数据分析小站",
  description: "数据分析小站的服务条款与使用规则。",
  alternates: {
    canonical: "/terms",
  },
};

const effectiveDate = "2026年11月14日";

export default function TermsPage() {
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
              服务条款
            </h1>
            <p className="mt-3 text-[13px] text-[#78716C]">生效日期：{effectiveDate}</p>
          </div>

          <div className="mt-8 space-y-8 text-[14px] leading-[1.85] text-[#1F1E1D]">
            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">一、服务说明与使用范围</h2>
              <p>
                “数据分析小站”是 dydata.cc 面向内容团队内部成员提供的工作台，用于团队内部选题管理、作品数据复盘、账号与权限管理、提醒通知和故障排查。注册需选择并申请加入团队，并由团队管理员审批。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">二、主体关系与账号权限</h2>
              <p>
                本网站由个人（杜娓乐）运营和维护，ICP 备案主体为杜娓乐（个人备案）。账号仅限本人使用，不得转借、出租、出售或与他人共用。用户应妥善保管登录凭据，不得绕过团队或平台设置的权限。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">三、使用规范</h2>
              <ul className="list-disc space-y-2 pl-5">
                <li>不得上传违法、违规或侵害他人合法权益的内容。</li>
                <li>上传作品截图、素材、文本和其他内容前，须确保自己或所属团队有权使用。</li>
                <li>不得抓取、复制、泄露或未经授权使用他人的数据，不得伪造、篡改记录或干扰系统正常运行。</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">四、数据与内容归属</h2>
              <p>
                团队业务数据及其产生的内容归团队所有。用户提交的内容，其权利归用户或依法享有权利的团队。平台仅在提供团队协作、数据复盘、权限管理和相关支持所必需的范围内，按授权处理和展示这些数据。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">五、第三方服务</h2>
              <p>
                平台生产环境使用 Supabase（数据库与认证）、腾讯云 COS（截图私有存储）、Vercel（网站托管）、Sentry（错误监控）、百度 OCR（截图文字识别）、团队自行配置的 AI 模型服务和飞书（提醒通知）。相关服务依其功能接收必要的数据处理请求。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">六、服务变更、中止与终止</h2>
              <p>
                平台会根据业务需要更新、调整或停止部分功能。因维护、故障、第三方服务变化或不可抗力需要中止服务时，我们会在条件允许的范围内提前提示并尽快恢复。用户违反本条款、团队权限要求或法律法规的，平台或团队管理员可以限制或终止其访问。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">七、免责声明</h2>
              <p>
                页面指标来自抖音后台截图与官方接口，仅供参考，以抖音官方数据为准。平台会尽力保持服务稳定，但不对因网络、第三方平台、设备或不可抗力造成的中断、延迟或数据差异承担超出法律规定的责任。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">八、知识产权</h2>
              <p>
                平台的软件、页面、商标、文档和其他平台内容的知识产权归本网站运营者杜娓乐或相关权利人所有。未经授权不得复制、修改、传播或用于本条款约定之外的用途。团队和用户提交的数据与内容，按第四条约定处理。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">九、法律适用与争议解决</h2>
              <p>
                本条款适用中华人民共和国法律。因本条款或服务产生争议时，双方应先协商解决；协商不成的，由本网站运营者杜娓乐住所地有管辖权的人民法院管辖。
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[14px] font-normal text-[#141413]">十、联系方式</h2>
              <p>如对本条款有疑问，请通过 1305085564@qq.com 联系运营方。</p>
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
