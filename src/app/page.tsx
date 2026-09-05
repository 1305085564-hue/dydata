import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  CheckCircle2,
  Compass,
  BarChart3,
  CalendarCheck,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "DYData - 抖音内容团队的数据履约与异常复盘工作台",
  description: "精确日报立卷、团队选题防撞、作品异常归因。让内容团队告别表格漏报与管理盲区。",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen min-h-dvh bg-[#FBF9F5] text-[#292524] antialiased">
      <main className="mx-auto max-w-7xl px-6 lg:px-12 2xl:max-w-[88rem]">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[#ECE7DE]/70 py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D97757] shadow-xs">
              <Zap className="size-4 fill-white text-white" />
            </div>
            <span className="font-serif text-lg font-[580] tracking-tight text-[#1C1917]">
              DYData
            </span>
            <span className="rounded bg-[#F5F3EE] px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-[#78716C]">
              工作台
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-[13px] font-medium text-[#78716C] transition-colors hover:text-[#1C1917]"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-[#F5F3EE] px-3.5 py-1.5 text-[13px] font-medium text-[#292524] transition-colors hover:bg-[#ECE7DE]"
            >
              申请加入团队
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="grid grid-cols-1 items-center gap-12 py-14 md:grid-cols-12 md:gap-12 md:py-24 2xl:gap-16">
          {/* Left: Product Manifesto */}
          <div className="space-y-8 md:col-span-6 lg:col-span-7">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E0D6] bg-white px-3 py-1 text-[12px] text-[#78716C]">
                <ShieldCheck className="size-3.5 text-[#D97757]" />
                <span>专为抖音机构与创作者团队打造</span>
              </div>
              <h1 className="font-serif text-3xl font-[580] leading-[1.25] tracking-tighter text-[#1C1917] sm:text-4xl lg:text-[2.6rem] text-balance">
                抖音内容团队的
                <br className="hidden sm:inline" />
                数据履约与异常复盘工作台
              </h1>
              <p className="max-w-xl text-[14px] leading-[1.75] text-[#78716C]">
                彻底终结表格收集的漏报漏发、考勤脱节与复盘盲区。
                让每日填报精确立卷，团队选题责任清晰，作品异常归因有据。
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D97757] px-6 py-2.5 text-[13px] font-medium text-white shadow-xs transition-opacity hover:opacity-90 active:scale-[0.99]"
              >
                <span>进入工作台</span>
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg border border-[#E5E0D6] bg-white px-5 py-2.5 text-[13px] font-medium text-[#292524] shadow-2xs transition-colors hover:bg-[#F5F3EE]"
              >
                申请加入团队
              </Link>
            </div>

            {/* Core Value Statement */}
            <div className="border-t border-[#ECE7DE] pt-6">
              <div className="grid grid-cols-3 gap-4 text-left">
                <div>
                  <p className="text-base font-medium tabular-nums text-[#1C1917]">T+0 / T+1</p>
                  <p className="text-[12px] text-[#78716C]">自然日裁剪与防漏对账</p>
                </div>
                <div>
                  <p className="text-base font-medium text-[#1C1917]">0 撞题</p>
                  <p className="text-[12px] text-[#78716C]">团队认领状态透明闭环</p>
                </div>
                <div>
                  <p className="text-base font-medium text-[#1C1917]">指标级</p>
                  <p className="text-[12px] text-[#78716C]">作品异常归因与证据链</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right — Editorial Preview Card */}
          <div className="relative md:col-span-6 lg:col-span-5">
            <div className="overflow-hidden rounded-2xl bg-white p-6 shadow-card-ring">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-[#D97757]" />
                  <span className="text-[13px] font-medium text-[#1C1917]">今日日报立卷</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded bg-[#F5F3EE] px-2 py-0.5 text-[11px] font-medium text-[#78716C]">
                  <CheckCircle2 className="size-3 text-[#43718E]" />
                  今日已按时履约
                </span>
              </div>

              {/* Sample Work Item */}
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-[#ECE7DE]/60 bg-[#F5F3EE]/60 p-4">
                  <div className="flex items-center justify-between text-[12px] text-[#78716C]">
                    <span>作品 #DY-20260828-01</span>
                    <span className="tabular-nums text-[#43718E]">已关联选题</span>
                  </div>
                  <h4 className="mt-1.5 text-[14px] font-medium text-[#1C1917]">
                    《职场沟通降维指南：如何用三句话说清重点》
                  </h4>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#ECE7DE]/60 pt-3">
                    <div>
                      <p className="text-[11px] text-[#78716C]">完播率</p>
                      <p className="font-medium tabular-nums text-[#1C1917]">24.8%</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#78716C]">点赞转化</p>
                      <p className="font-medium tabular-nums text-[#1C1917]">6.2%</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#78716C]">5秒停留</p>
                      <p className="font-medium tabular-nums text-[#1C1917]">68.5%</p>
                    </div>
                  </div>
                </div>

                {/* Second Item */}
                <div className="rounded-xl border border-[#ECE7DE]/70 bg-[#F5F3EE]/40 p-3.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#78716C]">进行中选题</span>
                    <span className="text-[11px] text-[#D97757]">今日待制作</span>
                  </div>
                  <p className="mt-1 text-[13px] text-[#292524]">
                    《下半年 AI 生产力工具实测对比》
                  </p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-5 flex items-center justify-between border-t border-[#ECE7DE] pt-3 text-[12px] text-[#78716C]">
                <span>填报人：内容创作组</span>
                <span className="font-mono text-[11px]">DYData Editorial OS</span>
              </div>
            </div>
          </div>
        </section>

        {/* Core Pillars Section */}
        <section className="border-t border-[#ECE7DE] py-16 lg:py-20">
          <div className="mb-12 space-y-2 text-center">
            <h2 className="font-serif text-2xl font-[580] tracking-tight text-[#1C1917]">
              三大核心断点，逐一兑现价值
            </h2>
            <p className="text-[13px] text-[#78716C]">
              不堆砌无关功能，只解决内容团队不可替代的业务损失
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Pillar 1 */}
            <div className="flex flex-col justify-between rounded-xl border border-[#ECE7DE] bg-white p-6 shadow-2xs">
              <div className="space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F5F3EE] text-[#D97757]">
                  <CalendarCheck className="size-5 stroke-[1.75]" />
                </div>
                <h3 className="text-base font-medium text-[#1C1917]">
                  精确日报立卷
                </h3>
                <p className="text-[13px] leading-[1.7] text-[#78716C]">
                  严格对齐自然月与业务日期，支持 T+0/T+1 状态回填与豁免扣除。确保作品产出、实发统计与考勤规则真实一致，告别微信群催报与错账。
                </p>
              </div>
              <div className="mt-6 border-t border-[#ECE7DE]/60 pt-3 text-[12px] font-medium text-[#43718E]">
                解决：漏发漏报、考勤失真
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="flex flex-col justify-between rounded-xl border border-[#ECE7DE] bg-white p-6 shadow-2xs">
              <div className="space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F5F3EE] text-[#D97757]">
                  <Compass className="size-5 stroke-[1.75]" />
                </div>
                <h3 className="text-base font-medium text-[#1C1917]">
                  团队选题防撞
                </h3>
                <p className="text-[13px] leading-[1.7] text-[#78716C]">
                  建立团队共享选题池，认领状态即时锁定、责任到人。支持撞题预警与立项确认，避免多个创作者重复劳动造成的产能内耗。
                </p>
              </div>
              <div className="mt-6 border-t border-[#ECE7DE]/60 pt-3 text-[12px] font-medium text-[#43718E]">
                解决：选题撞车、责任不清
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="flex flex-col justify-between rounded-xl border border-[#ECE7DE] bg-white p-6 shadow-2xs">
              <div className="space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F5F3EE] text-[#D97757]">
                  <BarChart3 className="size-5 stroke-[1.75]" />
                </div>
                <h3 className="text-base font-medium text-[#1C1917]">
                  作品异常归因
                </h3>
                <p className="text-[13px] leading-[1.7] text-[#78716C]">
                  将播放流失、完播率等核心指标与文案分段、历史基线联动排查。帮助管理者一眼定位低效作品的问题根源，提供扎实的诊断证据。
                </p>
              </div>
              <div className="mt-6 border-t border-[#ECE7DE]/60 pt-3 text-[12px] font-medium text-[#43718E]">
                解决：盲目复盘、经验无法量化
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-[#E5E0D6] py-10 md:flex-row md:gap-0">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#D97757]">
              <Zap className="size-3 fill-white text-white" />
            </div>
            <p className="text-[13px] text-[#292524]">
              DYData
              <span className="ml-1 text-[12px] text-[#78716C]">· 内容团队工作台</span>
            </p>
          </div>
          <p className="text-[12px] text-[#78716C]">
            专注文档级数据严谨度与创作者体验
          </p>
        </footer>
      </main>
    </div>
  );
}
