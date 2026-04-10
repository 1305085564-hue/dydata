import Link from "next/link";
import { ArrowRight, Settings2, Sparkles } from "lucide-react";

type NavCardItem = {
  title: string;
  description: string;
  href: string | null;
  label: string;
  icon?: typeof Settings2;
};

const NAV_CARDS: NavCardItem[] = [
  {
    title: "管理入口",
    description: "从这里回到总控台。",
    href: "/admin",
    label: "返回总控台",
  },
  {
    title: "AI 渠道管理",
    description: "管理各家模型渠道与 failover 顺序。",
    href: "/admin/ai-channels",
    label: "去看渠道",
  },
  {
    title: "AI 功能配置",
    description: "按功能指定渠道、模型和提示词。",
    href: null,
    label: "当前页面",
    icon: Settings2,
  },
];

export function AIFeaturesHero() {
  return (
    <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] px-5 py-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:px-6 sm:py-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Feature Routing</p>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">AI 功能配置</h1>
            <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
              先看每个 AI 功能到底服务哪个页面、哪一段输出，再决定渠道、模型和专属提示词。留空时走默认 failover 和系统提示词。
            </p>
          </div>
        </div>
        <div className="grid gap-2 rounded-2xl border border-white/80 bg-white/88 p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[320px]">
          <div className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
            <Sparkles className="size-3.5 text-[var(--color-primary)]" />
            功能导航
          </div>
          <div className="space-y-2 pt-1">
            {NAV_CARDS.map((item) =>
              item.href ? (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl border border-white/75 bg-white/80 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] transition hover:-translate-y-px hover:border-primary/20 hover:text-[var(--color-text-primary)]"
                >
                  <div className="flex items-start gap-3">
                    {"icon" in item && item.icon ? (
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                        <item.icon className="size-4" />
                      </div>
                    ) : null}
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">{item.title}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-[var(--color-text-tertiary)]" />
                </Link>
              ) : (
                <div key={item.title} className="rounded-2xl border border-primary/15 bg-primary/10 px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
                  <div className="flex items-start gap-3">
                    {"icon" in item && item.icon ? (
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-primary/15 bg-white/70 text-primary">
                        <item.icon className="size-4" />
                      </div>
                    ) : null}
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">{item.title}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
