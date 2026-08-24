import Link from "next/link";

import type { DashboardPageData } from "@/lib/loaders/dashboard-page";

type Tone = "warn" | "neutral" | "success";

function formatToday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${m}月${d}日 · ${week}`;
}

const TONE_TEXT: Record<Tone, string> = {
  warn: "text-[#D99E55]",
  neutral: "text-claude-ink-600",
  success: "text-[#6FAA7D]",
};

const TONE_DOT: Record<Tone, string> = {
  warn: "#D99E55",
  neutral: "#78716C",
  success: "#6FAA7D",
};

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-[#FBF9F5] px-2 py-0.5 text-[12px] font-medium ${TONE_TEXT[tone]}`}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: TONE_DOT[tone] }}
      />
      {children}
    </span>
  );
}

export function MobileHomeView({ data }: { data: DashboardPageData }) {
  const { today, userDisplayName, monthSubmittedDates, summary, hasPendingExemption, todayReports } =
    data;

  if (summary.totalAccounts === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="font-serif text-xl text-claude-ink-950">账号还在路上</p>
        <p className="text-[13px] text-claude-ink-600">
          联系管理员为你分配抖音账号后，这里会显示你的数据。
        </p>
      </div>
    );
  }

  const todos: Array<{ title: string; sub: string; status: string; tone: Tone }> = [];
  if (summary.pendingCount > 0) {
    todos.push({
      title: "提交今日日报",
      sub: `${summary.pendingCount} 个账号待提交`,
      status: "待办",
      tone: "warn",
    });
  }
  if (hasPendingExemption) {
    todos.push({ title: "豁免申请", sub: "审核中", status: "审核中", tone: "neutral" });
  }
  for (const report of todayReports.slice(0, 3)) {
    todos.push({
      title: report.title || "未命名日报",
      sub: `今日已提交 · 播放 ${report.play_count ?? 0}`,
      status: "已交",
      tone: "success",
    });
  }

  const kpis = [
    { label: "本月提交", value: monthSubmittedDates.length, unit: "天" },
    { label: "今日已交", value: summary.submittedCount, unit: "个" },
    { label: "待提交", value: summary.pendingCount, unit: "个" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-[13px] text-claude-ink-600">{formatToday(today)}</p>
        <h1 className="font-serif text-[26px] font-semibold leading-tight text-claude-ink-950">
          你好，{userDisplayName}
        </h1>
        <p className="text-[13px] text-claude-ink-600">
          本月已提交 {monthSubmittedDates.length} 天，保持节奏。
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-1 rounded-2xl bg-claude-surface p-4">
            <p className="text-[12px] text-claude-ink-600">{k.label}</p>
            <p className="font-sans text-[26px] font-medium leading-none tabular-nums text-claude-ink-950">
              {k.value}
              <span className="ml-0.5 text-[13px] font-normal text-claude-ink-600">
                {k.unit}
              </span>
            </p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-claude-ink-950">今日待办</h2>
          <span className="text-[12px] text-claude-ink-600">{todos.length} 项</span>
        </div>
        {todos.length === 0 ? (
          <div className="rounded-2xl bg-claude-surface p-5 text-center text-[13px] text-claude-ink-600">
            今天没有待办，好好休息。
          </div>
        ) : (
          <ul className="flex flex-col">
            {todos.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-claude-border-light py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-[14px] text-claude-ink-950">{t.title}</p>
                  <p className="truncate text-[12px] text-claude-ink-600">{t.sub}</p>
                </div>
                <Pill tone={t.tone}>{t.status}</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-claude-ink-950">选题动态</h2>
        <Link
          href="/m/topics"
          className="flex items-center justify-between gap-3 rounded-2xl bg-claude-surface p-4 transition-colors active:bg-claude-canvas"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-[14px] text-claude-ink-950">查看本周选题进展</p>
            <p className="text-[12px] text-claude-ink-600">
              认领、横向对比与 AI 推荐，都在选题库。
            </p>
          </div>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 shrink-0 text-claude-ink-600"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </section>
    </div>
  );
}
