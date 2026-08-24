import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  FileText,
  PieChart,
  Clock,
  TrendingUp,
} from "lucide-react";
export const metadata: Metadata = {
  title: "抖音数据日报平台",
  description: "让团队数据记录、运营分析和成长复盘更高效。",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#FBF9F5]">
      <main className="mx-auto max-w-7xl px-6 lg:px-12 2xl:max-w-[88rem]">
        {/* Header */}
        <nav className="flex items-center justify-between py-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D97757]">
              <Zap className="size-4 fill-white text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-[#1C1917]">
              DYData
            </span>
            <span className="text-[12px] font-normal uppercase tracking-[0.25em] text-[#78716C]">
              CNSL
            </span>
          </Link>
        </nav>

        {/* Hero */}
        <section className="grid grid-cols-1 items-center gap-12 py-12 md:grid-cols-2 md:gap-16 md:py-24 2xl:gap-20">
          {/* Left */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="font-serif text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-[#1C1917] text-balance">
                抖音数据日报平台
              </h1>
              <p className="max-w-lg text-[13px] leading-[1.7] text-[#292524]">
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

            <div className="inline-block border-t border-[#ECE7DE] pt-6">
              <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-[#78716C]">
                TRUSTED BY TEAMS
              </p>
              <p className="mt-2 text-[13px] text-[#78716C]">
                已有 2,400+ 个内容团队在此高效协作
              </p>
            </div>
          </div>

          {/* Right — Dashboard Mockup */}
          <div className="relative">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-[#E5E0D6] bg-white shadow-sm">
              {/* Window chrome */}
              <div className="flex h-10 items-center gap-1.5 border-b border-[#ECE7DE] px-4">
                <div className="h-2 w-2 rounded-full bg-[#E5E0D6]" />
                <div className="h-2 w-2 rounded-full bg-[#E5E0D6]" />
                <div className="h-2 w-2 rounded-full bg-[#E5E0D6]" />
              </div>
              {/* Mock content */}
              <div className="space-y-5 p-6">
                <div className="flex items-end justify-between">
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 rounded bg-[#F5F3EE]" />
                    <div className="h-5 w-32 rounded bg-[#1C1917]/[0.06]" />
                  </div>
                  <div className="h-8 w-20 rounded-md bg-[#D97757]/20" />
                </div>
                {/* Chart bars */}
                <div className="flex h-32 items-end gap-3">
                  <div className="h-[40%] flex-1 rounded-t bg-[#F5F3EE]" />
                  <div className="h-[60%] flex-1 rounded-t bg-[#F5F3EE]" />
                  <div className="h-[90%] flex-1 rounded-t bg-[#D97757]/80" />
                  <div className="h-[50%] flex-1 rounded-t bg-[#F5F3EE]" />
                  <div className="h-[75%] flex-1 rounded-t bg-[#F5F3EE]" />
                  <div className="h-[45%] flex-1 rounded-t bg-[#F5F3EE]" />
                  <div className="h-[85%] flex-1 rounded-t bg-[#F5F3EE]" />
                </div>
                {/* List items */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 rounded-lg border border-[#ECE7DE] p-3">
                    <div className="h-8 w-8 rounded bg-[#F5F3EE]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2 w-1/2 rounded bg-[#F5F3EE]" />
                      <div className="h-2 w-1/4 rounded bg-[#F5F3EE]/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-[#ECE7DE] p-3">
                    <div className="h-8 w-8 rounded bg-[#F5F3EE]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2 w-1/3 rounded bg-[#F5F3EE]" />
                      <div className="h-2 w-1/5 rounded bg-[#F5F3EE]/50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Float card */}
            <div className="absolute -bottom-4 -left-4 hidden rounded-xl border border-[#E5E0D6] bg-white p-4 shadow-sm md:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D97757]/10">
                  <TrendingUp className="size-5 text-[#D97757]" />
                </div>
                <div>
                  <p className="text-[12px] font-medium tabular-nums text-[#292524]">+240.5%</p>
                  <p className="text-[12px] text-[#78716C]">昨日播放增长率</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-[#ECE7DE] py-20 2xl:py-24">
          <div className="mb-16 space-y-3 text-center">
            <h2 className="text-lg font-semibold text-[#1C1917]">
              一套系统，覆盖内容团队全链路
            </h2>
            <p className="text-[13px] text-[#78716C]">
              从日报沉淀到跨部门协同，每个细节都符合内容创作规律
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8 2xl:gap-12">
            {/* Feature 1 */}
            <div className="space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F5F3EE] text-[#D97757]">
                <FileText className="size-5 stroke-[1.5]" />
              </div>
              <h3 className="text-base font-semibold text-[#1C1917]">日报填报</h3>
              <p className="text-[13px] leading-[1.7] text-[#78716C]">
                每日数据一键提交，多账号统一管理，再也不漏报。支持自定义填报字段与自动提醒。
              </p>
            </div>

            {/* Feature 2 */}
            <div className="space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F5F3EE] text-[#D97757]">
                <PieChart className="size-5 stroke-[1.5]" />
              </div>
              <h3 className="text-base font-semibold text-[#1C1917]">经营分析</h3>
              <p className="text-[13px] leading-[1.7] text-[#78716C]">
                实时看板、趋势图、排行榜，数据驱动决策。多维度对比分析，一眼洞察核心增长点。
              </p>
            </div>

            {/* Feature 3 */}
            <div className="space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F5F3EE] text-[#D97757]">
                <Clock className="size-5 stroke-[1.5]" />
              </div>
              <h3 className="text-base font-semibold text-[#1C1917]">AI 助手</h3>
              <p className="text-[13px] leading-[1.7] text-[#78716C]">
                智能文案改写、违规检测、内容方向建议。基于行业大数据的 AI 指导，让创作更精准。
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-[#E5E0D6] py-12 md:flex-row md:gap-0">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#D97757]">
              <Zap className="size-3 fill-white text-white" />
            </div>
            <p className="text-[13px] font-normal text-[#292524]">
              DYData
              <span className="ml-1 text-[12px] text-[#78716C]">© 2025</span>
            </p>
          </div>
          <a
            href="mailto:1305085564@qq.com"
            className="text-[13px] text-[#78716C] transition-colors hover:text-[#D97757]"
          >
            1305085564@qq.com
          </a>
        </footer>
      </main>
    </div>
  );
}
