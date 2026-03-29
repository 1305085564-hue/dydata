"use client";

import { useMemo, useState } from "react";
import { DashboardForm, type DashboardAccountOption, type DashboardReportData } from "./dashboard-form";

interface Props {
  accounts: DashboardAccountOption[];
  today: string;
  todayReports: DashboardReportData[];
}

function DashboardSubmitPanel({ accounts, today, todayReports }: Props) {
  const [selectedAccountId] = useState(accounts[0]?.id ?? "");

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
        <p className="text-sm text-muted-foreground mt-1">
          <span className="text-orange-500">⚠️ 暂无可用账号，请联系管理员</span>
        </p>
        <section className="dashboard-surface dashboard-surface-panel rounded-[1.5rem] border-0 p-4 sm:p-5">
          <h2 className="text-lg font-semibold mb-3">提交日报</h2>
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            当前账号尚未初始化，暂时无法提交日报。
          </div>
        </section>
      </div>
    );
  }

  const accountName = currentAccount?.name ?? "当前账号";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mt-1">
        {currentReport ? (
          <span className="text-green-600">✅ {accountName} 今日已提交</span>
        ) : (
          <span className="text-orange-500">⚠️ {accountName} 今日未提交</span>
        )}
      </p>

      <section className="dashboard-surface dashboard-surface-panel rounded-[1.5rem] border-0 p-4 sm:p-5">
        <h2 className="text-lg font-semibold mb-3">提交日报</h2>
        <div className="rounded-xl border px-4 py-3 mb-4 text-sm bg-muted/30 text-muted-foreground">
          {currentReport ? `${accountName} 今日已有记录，可直接修改该账号数据。` : `${accountName} 今日暂无记录，可直接提交该账号数据。`}
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
