import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Zap,
  FileText,
  PieChart,
  Clock,
  TrendingUp,
} from "lucide-react";
import { hasSupabaseAuthCookie } from "@/lib/supabase-auth-cookie";

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasAuthCookie = hasSupabaseAuthCookie(
    cookieStore.getAll(),
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );

  // 首页不再为了判断登录状态去请求 Supabase，避免每次首屏都卡在鉴权回源。
  if (hasAuthCookie) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <main className="mx-auto max-w-7xl px-6 lg:px-12 2xl:max-w-[88rem]">
        {/* Header */}
        <nav className="flex items-center justify-between py-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D97757]">
              <Zap className="size-4 fill-white text-white" />
            </div>
            <span className="text-[18px] font-semibold tracking-tight text-[#27272A]">
              DYData
            </span>
            <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-[#A1A1AA]">
              CNSL
            </span>
          </Link>
        </nav>

        {/* Hero */}
        <section className="grid grid-cols-1 items-center gap-12 py-12 md:grid-cols-2 md:gap-16 md:py-24 2xl:gap-20">
          {/* Left */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-[#27272A] md:text-[30px]">
                抖音数据日报平台
              </h1>
              <p className="max-w-lg text-[14px] leading-[1.7] text-[#71717A] md:text-[18px]">
                让团队数据记录、分析和成长复盘，像呼吸一样自然
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-[#D97757] px-6 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                登录工作台
              </Link>
            </div>

            <div className="inline-block border-t border-[#E4E4E7] pt-6">
              <p className="text-[12px] font-medium uppercase tracking-[0.25em] text-[#A1A1AA]">
                TRUSTED BY TEAMS
              </p>
              <p className="mt-2 text-[12px] text-[#A1A1AA]">
                已有 2,400+ 个内容团队在此高效协作
              </p>
            </div>
          </div>

          {/* Right — Dashboard Mockup */}
          <div className="relative">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-[#E4E4E7] bg-white shadow-sm">
              {/* Window chrome */}
              <div className="flex h-10 items-center gap-1.5 border-b border-[#E4E4E7] px-4">
                <div className="h-2 w-2 rounded-full bg-[#E4E4E7]" />
                <div className="h-2 w-2 rounded-full bg-[#E4E4E7]" />
                <div className="h-2 w-2 rounded-full bg-[#E4E4E7]" />
              </div>
              {/* Mock content */}
              <div className="space-y-5 p-6">
                <div className="flex items-end justify-between">
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 rounded bg-[#F4F4F5]" />
                    <div className="h-5 w-32 rounded bg-[#27272A]/[0.06]" />
                  </div>
                  <div className="h-8 w-20 rounded-md bg-[#D97757]/20" />
                </div>
                {/* Chart bars */}
                <div className="flex h-32 items-end gap-3">
                  <div className="h-[40%] flex-1 rounded-t bg-[#F4F4F5]" />
                  <div className="h-[60%] flex-1 rounded-t bg-[#F4F4F5]" />
                  <div className="h-[90%] flex-1 rounded-t bg-[#D97757]/80" />
                  <div className="h-[50%] flex-1 rounded-t bg-[#F4F4F5]" />
                  <div className="h-[75%] flex-1 rounded-t bg-[#F4F4F5]" />
                  <div className="h-[45%] flex-1 rounded-t bg-[#F4F4F5]" />
                  <div className="h-[85%] flex-1 rounded-t bg-[#F4F4F5]" />
                </div>
                {/* List items */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 rounded-lg border border-[#E4E4E7] p-3">
                    <div className="h-8 w-8 rounded bg-[#F4F4F5]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2 w-1/2 rounded bg-[#F4F4F5]" />
                      <div className="h-2 w-1/4 rounded bg-[#F4F4F5]/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-[#E4E4E7] p-3">
                    <div className="h-8 w-8 rounded bg-[#F4F4F5]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2 w-1/3 rounded bg-[#F4F4F5]" />
                      <div className="h-2 w-1/5 rounded bg-[#F4F4F5]/50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Float card */}
            <div className="absolute -bottom-4 -left-4 hidden rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-lg md:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D97757]/10">
                  <TrendingUp className="size-5 text-[#D97757]" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[#27272A]">+240.5%</p>
                  <p className="text-[12px] text-[#A1A1AA]">昨日播放增长率</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-[#E4E4E7] py-24 2xl:py-28">
          <div className="mb-16 space-y-4 text-center">
            <h2 className="text-[24px] font-semibold text-[#27272A]">
              一套系统，覆盖内容团队全链路
            </h2>
            <div className="mx-auto h-1 w-12 rounded-full bg-[#D97757]" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 2xl:gap-8">
            {/* Card 1 */}
            <div className="group rounded-2xl border border-[#E4E4E7] bg-[#FAFAFB] p-8 transition-colors duration-150 hover:bg-white">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-[#E4E4E7] bg-white text-[#D97757]">
                <FileText className="size-6 stroke-[1.5]" />
              </div>
              <h3 className="text-[18px] font-semibold text-[#27272A]">日报填报</h3>
              <p className="mt-3 text-[13px] leading-[1.7] text-[#71717A]">
                每日数据一键提交，多账号统一管理，再也不漏报。支持自定义填报字段与自动提醒。
              </p>
            </div>

            {/* Card 2 */}
            <div className="group rounded-2xl border border-[#E4E4E7] bg-[#FAFAFB] p-8 transition-colors duration-150 hover:bg-white">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-[#E4E4E7] bg-white text-[#D97757]">
                <PieChart className="size-6 stroke-[1.5]" />
              </div>
              <h3 className="text-[18px] font-semibold text-[#27272A]">经营分析</h3>
              <p className="mt-3 text-[13px] leading-[1.7] text-[#71717A]">
                实时看板、趋势图、排行榜，数据驱动决策。多维度对比分析，一眼洞察核心增长点。
              </p>
            </div>

            {/* Card 3 */}
            <div className="group rounded-2xl border border-[#E4E4E7] bg-[#FAFAFB] p-8 transition-colors duration-150 hover:bg-white">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-[#E4E4E7] bg-white text-[#D97757]">
                <Clock className="size-6 stroke-[1.5]" />
              </div>
              <h3 className="text-[18px] font-semibold text-[#27272A]">AI 助手</h3>
              <p className="mt-3 text-[13px] leading-[1.7] text-[#71717A]">
                智能文案改写、违规检测、内容方向建议。基于行业大数据的 AI 指导，让创作更精准。
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-[#E4E4E7] py-12 md:flex-row md:gap-0">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#D97757]">
              <Zap className="size-3 fill-white text-white" />
            </div>
            <p className="text-[13px] font-medium text-[#27272A]/80">
              DYData
              <span className="ml-1 text-[12px] text-[#A1A1AA]">© 2025</span>
            </p>
          </div>
          <a
            href="mailto:1305085564@qq.com"
            className="text-[13px] text-[#71717A] transition-colors hover:text-[#D97757]"
          >
            1305085564@qq.com
          </a>
        </footer>
      </main>
    </div>
  );
}
