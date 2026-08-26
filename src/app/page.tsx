import type { Metadata } from "next";
import Link from "next/link";
import {
  Feather,
  Compass,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  DeskStudyIllustration,
  CompassConstellationIllustration,
  ZenFinishedIllustration,
  ColophonMark,
  EditorialStamp,
} from "@/components/editorial/editorial-illustrations";

export const metadata: Metadata = {
  title: "DYData · 创作者数据读本",
  description: "学者案头质感的创作数据读本。记录表达纪事，洞察成长航向，研磨灵感手稿。",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#292524] antialiased">
      <main className="mx-auto max-w-7xl px-6 lg:px-12 2xl:max-w-[88rem]">
        {/* 顶部简雅导航 */}
        <nav className="flex items-center justify-between py-8 border-b border-[#ECE7DE]/70">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D97757] text-white shadow-sm transition-transform group-hover:scale-105">
              <Feather className="size-4" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-lg font-semibold tracking-tight text-[#1C1917]">
                DYData
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-[#78716C]">
                READING ROOM
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-[#D97757] hover:bg-[#C46A4D] px-4 py-2 text-[13px] font-medium text-white transition-all shadow-sm active:scale-[0.985]"
            >
              <span>翻开工作台</span>
              <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </div>
        </nav>

        {/* Hero 主展区：学者案头与创作者读本 */}
        <section className="grid grid-cols-1 items-center gap-12 py-10 md:grid-cols-12 md:gap-16 md:py-16">
          {/* 左侧：思想与立卷 */}
          <div className="space-y-8 md:col-span-6 lg:col-span-7">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <EditorialStamp text="案头纪事" variant="terracotta" />
                <span className="text-[12px] text-[#78716C] tracking-wide">
                  创作立卷 · 表达沉淀
                </span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold leading-[1.3] tracking-tight text-[#1C1917] text-balance">
                一本属于创作者的
                <br />
                <span className="text-[#D97757]">现代数据手稿读本</span>
              </h1>
              <p className="max-w-xl text-[13.5px] leading-[1.8] text-[#78716C]">
                告别冰冷生硬的工业报表与机械填报。DYData 将每一次作品发布转化为一份值得静心研读的立卷札记，让团队协同、数据洞察与成长复盘，从容如学者案头沉思。
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-[#D97757] hover:bg-[#C46A4D] px-6 py-2.5 text-[13.5px] font-medium text-white transition-all shadow-sm active:scale-[0.985]"
              >
                <span>进入创作案头</span>
                <ArrowRight className="ml-2 size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg border border-[#E5E0D6] bg-white hover:bg-[#F5F3EE] px-5 py-2.5 text-[13px] font-medium text-[#292524] transition-all"
              >
                了解排版哲学
              </Link>
            </div>

            <div className="inline-block border-t border-[#ECE7DE] pt-5 w-full max-w-md">
              <div className="flex items-center justify-between text-[12px] text-[#78716C]">
                <span>✦ 象牙漫反射纸底</span>
                <span>✦ 纯矢量暖墨线描</span>
                <span>✦ 知识分子同行语调</span>
              </div>
            </div>
          </div>

          {/* 右侧：精装读本手稿视窗 */}
          <div className="md:col-span-6 lg:col-span-5">
            <div className="relative rounded-2xl border border-[#ECE7DE] bg-gradient-to-br from-[#FAF8F4] via-white to-[#F5F3EE]/50 p-6 shadow-claude-float">
              {/* 装饰插图 */}
              <div className="flex justify-center -mt-2 -mb-3">
                <DeskStudyIllustration size={130} />
              </div>

              {/* 案头卡片排版 */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-3">
                  <div className="space-y-0.5">
                    <span className="font-serif text-sm font-medium text-[#1C1917]">今日创作立卷</span>
                    <p className="text-[11.5px] text-[#78716C]">自然日历 · 2026-08-26</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6FAA7D] bg-[#6FAA7D]/10 px-2 py-0.5 rounded-full">
                    <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                    已从容归档
                  </span>
                </div>

                {/* 指标三联微气垫 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-[#F5F3EE] p-2.5 text-center">
                    <div className="text-[11px] text-[#78716C]">总播放</div>
                    <div className="font-serif text-[15px] font-semibold text-[#1C1917] tabular-nums mt-0.5">14.8万</div>
                  </div>
                  <div className="rounded-xl bg-[#F5F3EE] p-2.5 text-center">
                    <div className="text-[11px] text-[#78716C]">涨粉数</div>
                    <div className="font-serif text-[15px] font-semibold text-[#1C1917] tabular-nums mt-0.5">+1,280</div>
                  </div>
                  <div className="rounded-xl bg-[#F5F3EE] p-2.5 text-center">
                    <div className="text-[11px] text-[#78716C]">完播率</div>
                    <div className="font-serif text-[15px] font-semibold text-[#1C1917] tabular-nums mt-0.5">38.4%</div>
                  </div>
                </div>

                {/* 学者边注摘录 */}
                <div className="rounded-xl border border-[#ECE7DE] bg-white p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#D97757]">
                    <span>✦</span>
                    <span>AI 研磨札记 · 表达焦点</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-[#78716C]">
                    “开篇 3 秒的情绪钩子显著拉升了完播曲线，建议将此类设问句式沉淀为团队可复用手稿模板。”
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 核心篇章概览 */}
        <section className="border-t border-[#ECE7DE] py-16 lg:py-20">
          <div className="mb-14 space-y-2 text-center max-w-xl mx-auto">
            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-[#78716C]">
              THREE CHAPTERS
            </p>
            <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
              三大核心创作空间
            </h2>
            <p className="text-[13px] text-[#78716C] leading-relaxed">
              从灵感研磨、立卷沉淀到长程成长，每一个模块均遵循学者案头的人文装帧标准
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* 篇章 1 */}
            <div className="rounded-2xl border border-[#ECE7DE] bg-white p-6 space-y-4 hover:shadow-claude-float transition-all">
              <div className="flex justify-center -mt-2 -mb-2">
                <DeskStudyIllustration size={80} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-base font-semibold text-[#1C1917]">创作立卷 · 表达纪事</h3>
                  <EditorialStamp text="工作台" variant="terracotta" />
                </div>
                <p className="text-[12.5px] leading-[1.7] text-[#78716C]">
                  宣纸质感输入、智能截图解析与轻量微调。让每一次日终收卷从容有序，支持停笔调养与多账号协同。
                </p>
              </div>
            </div>

            {/* 篇章 2 */}
            <div className="rounded-2xl border border-[#ECE7DE] bg-white p-6 space-y-4 hover:shadow-claude-float transition-all">
              <div className="flex justify-center -mt-2 -mb-2">
                <CompassConstellationIllustration size={80} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-base font-semibold text-[#1C1917]">创作成长 · 体检罗盘</h3>
                  <EditorialStamp text="成长体检" variant="sage" />
                </div>
                <p className="text-[12.5px] leading-[1.7] text-[#78716C]">
                  六维体征雷达、趋势曲线与同行教练卡。以引述体与学者边注指引下一篇章的航向，告别焦虑盲目追赶。
                </p>
              </div>
            </div>

            {/* 篇章 3 */}
            <div className="rounded-2xl border border-[#ECE7DE] bg-white p-6 space-y-4 hover:shadow-claude-float transition-all">
              <div className="flex justify-center -mt-2 -mb-2">
                <ZenFinishedIllustration size={80} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-base font-semibold text-[#1C1917]">灵感手稿 · 选题认领</h3>
                  <EditorialStamp text="选题库" variant="storm" />
                </div>
                <p className="text-[12.5px] leading-[1.7] text-[#78716C]">
                  时代痛点与敏锐立意。团队动态实时关联、成片智能追踪与满额智能替换，让创作灵感井然有序。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 完卷徽记与页尾 */}
        <ColophonMark />

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-[#ECE7DE] py-10 md:flex-row md:gap-0 text-[12.5px] text-[#78716C]">
          <div className="flex items-center gap-2">
            <span className="font-serif font-semibold text-[#1C1917]">DYData</span>
            <span>· 创作者数据读本</span>
            <span>© 2026</span>
          </div>
          <p className="italic">
            “灵感偶得，工致乃成。”
          </p>
        </footer>
      </main>
    </div>
  );
}

