"use client";

import { useMemo, useState } from "react";
import { DashboardForm, type DashboardAccountOption, type DashboardReportData } from "./dashboard-form";

interface Props {
  accounts: DashboardAccountOption[];
  today: string;
  todayReports: DashboardReportData[];
}

function DashboardSubmitPanel({ accounts, today, todayReports }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");

  const currentAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );

  const currentReport = useMemo(
    () => todayReports.find((report) => report.account_id === (currentAccount?.id ?? "")) ?? null,
    [todayReports, currentAccount],
  );

  if (!accounts.length) {
    return (
      <div className="space-y-3">
        <p className="mt-1 inline-flex items-center gap-2 text-[13px] text-stone-500">
          <span className="inline-block h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
          暂无可用账号，请联系管理员
        </p>
        <section className="rounded-2xl border border-stone-200 bg-[#FAFAFB] p-4 sm:p-5">
          <h2 className="mb-3 text-[24px] font-semibold tracking-tight text-stone-800">提交日报</h2>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-[13px] leading-[1.7] text-stone-500">
            当前账号尚未初始化，暂时无法提交日报。
          </div>
        </section>
      </div>
    );
  }

  const accountName = currentAccount?.name ?? "当前账号";

  return (
    <div className="space-y-3">
      <p className="mt-1 inline-flex items-center gap-2 text-[13px] text-stone-500">
        {currentReport ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
            <span>{accountName} 今日已提交</span>
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
            <span>{accountName} 今日未提交</span>
          </>
        )}
      </p>

      <section className="rounded-2xl border border-stone-200 bg-[#FAFAFB] p-4 sm:p-5">
        <h2 className="mb-3 text-[24px] font-semibold tracking-tight text-stone-800">提交日报</h2>

        {accounts.length > 1 ? (
          <div className="mb-4 space-y-2">
            <label htmlFor="dashboard-account-switch" className="text-[13px] font-medium text-stone-800">
              选择要提交的账号
            </label>
            <select
              id="dashboard-account-switch"
              value={currentAccount?.id ?? ""}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="flex h-10 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-800 outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-1 focus-visible:ring-stone-950/5"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-[13px] leading-[1.7] text-stone-500">
          {currentReport
            ? `${accountName} 今日已有记录，可直接修改该账号数据。`
            : `${accountName} 今日暂无记录，可直接提交该账号数据。`}
        </div>
        <DashboardForm
          key={currentReport?.id ?? currentAccount?.id ?? "empty"}
          accounts={accounts}
          defaultAccountId={currentAccount?.id ?? ""}
          today={today}
          existingData={currentReport}
        />
      </section>
    </div>
  );
}

export { DashboardSubmitPanel as 日报提交面板 };
