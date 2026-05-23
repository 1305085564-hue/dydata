"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/animated-number";
import { getExemptionStateForDate, type ExemptionProfileLike } from "@/lib/豁免";
import { ExemptionDialog } from "./豁免弹窗";

interface Profile extends ExemptionProfileLike {
  name: string;
  role: string;
}

interface AccountRow {
  id: string;
  name: string;
  profile_id: string;
  profile_name: string;
  content_direction: string | null;
  presentation_format: string | null;
}

interface SubmissionStatusProps {
  profiles: Profile[];
  accounts: AccountRow[];
  submittedProfileIds: string[];
  submittedAccountIds: string[];
  defaultDate: string;
}

type ViewMode = "profile" | "account";

export function SubmissionStatus({
  profiles,
  accounts,
  submittedProfileIds,
  submittedAccountIds,
  defaultDate,
}: SubmissionStatusProps) {
  const [date, setDate] = useState(defaultDate);
  const [viewMode, setViewMode] = useState<ViewMode>("profile");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const router = useRouter();

  const SS_PAGE_SIZE = 10;
  const [profilePage, setProfilePage] = useState(1);
  const [profileSubmittedExpanded, setProfileSubmittedExpanded] = useState(false);
  const [accountPage, setAccountPage] = useState(1);
  const [accountSubmittedExpanded, setAccountSubmittedExpanded] = useState(false);

  const submittedProfileSet = useMemo(() => new Set(submittedProfileIds), [submittedProfileIds]);
  const submittedAccountSet = useMemo(() => new Set(submittedAccountIds), [submittedAccountIds]);

  const profileStates = useMemo(
    () =>
      profiles.map((profile) => ({
        ...profile,
        exemption: getExemptionStateForDate(profile, date),
      })),
    [profiles, date]
  );

  const profileMap = useMemo(
    () => new Map(profileStates.map((profile) => [profile.id, profile])),
    [profileStates]
  );

  const profileRows = useMemo(() => {
    const rows = profileStates.map((profile) => {
      const ownAccounts = accounts.filter((account) => account.profile_id === profile.id);
      const submittedAccountCount = ownAccounts.filter((account) => submittedAccountSet.has(account.id)).length;
      const totalAccountCount = ownAccounts.length;
      const isSubmitted =
        totalAccountCount > 0
          ? submittedAccountCount === totalAccountCount
          : submittedProfileSet.has(profile.id);
      const statusText =
        totalAccountCount > 0
          ? `${submittedAccountCount}/${totalAccountCount} 已提交`
          : isSubmitted
            ? "已提交"
            : "未提交";

      return {
        ...profile,
        accountCount: totalAccountCount,
        submittedAccountCount,
        isSubmitted,
        isPartial: submittedAccountCount > 0 && submittedAccountCount < totalAccountCount,
        statusText,
        ownAccounts,
      };
    });

    const activeRows = rows
      .filter((row) => !row.exemption.isExempt)
      .sort((a, b) => {
        if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? 1 : -1;
        if (a.isPartial !== b.isPartial) return a.isPartial ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-CN");
      });

    const exemptRows = rows
      .filter((row) => row.exemption.isExempt)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    return { activeRows, exemptRows };
  }, [accounts, profileStates, submittedAccountSet, submittedProfileSet]);

  const accountRows = useMemo(() => {
    const rows = accounts
      .map((account) => {
        const profile = profileMap.get(account.profile_id);
        const exemption = profile?.exemption;
        return {
          ...account,
          profile,
          exemption,
          isSubmitted: submittedAccountSet.has(account.id),
        };
      })
      .filter(
        (row): row is typeof row & { profile: NonNullable<typeof row.profile>; exemption: NonNullable<typeof row.exemption> } =>
          Boolean(row.profile && row.exemption)
      );

    const activeRows = rows
      .filter((row) => !row.exemption.isExempt)
      .sort((a, b) => {
        if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? 1 : -1;
        return a.profile_name.localeCompare(b.profile_name, "zh-CN") || a.name.localeCompare(b.name, "zh-CN");
      });

    const exemptRows = rows
      .filter((row) => row.exemption.isExempt)
      .sort((a, b) => a.profile_name.localeCompare(b.profile_name, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));

    return { activeRows, exemptRows };
  }, [accounts, profileMap, submittedAccountSet]);

  const summary = useMemo(() => {
    if (viewMode === "account") {
      const totalActive = accountRows.activeRows.length;
      const submittedCount = accountRows.activeRows.filter((row) => row.isSubmitted).length;
      const unsubmittedCount = totalActive - submittedCount;
      const submitRate = totalActive > 0 ? Math.round((submittedCount / totalActive) * 100) : 0;
      return { totalActive, submittedCount, unsubmittedCount, submitRate, totalLabel: "在岗账号" };
    }

    const totalActive = profileRows.activeRows.length;
    const submittedCount = profileRows.activeRows.filter((row) => row.isSubmitted).length;
    const unsubmittedCount = totalActive - submittedCount;
    const submitRate = totalActive > 0 ? Math.round((submittedCount / totalActive) * 100) : 0;
    return { totalActive, submittedCount, unsubmittedCount, submitRate, totalLabel: "在岗人数" };
  }, [accountRows.activeRows, profileRows.activeRows, viewMode]);

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDate(e.target.value);
    router.push(`/admin?date=${e.target.value}`);
  }

  function openDialog(profile: Profile) {
    setSelectedProfile(profile);
  }

  function renderRole(role: string) {
    if (role === "owner") return "创始人";
    if (role === "admin") return "管理员";
    return "成员";
  }

  function renderExemptionHint(label: string | null, reason: string | null) {
    if (!label && !reason) return null;

    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        {label && <p>{label}</p>}
        {reason && <p>原因：{reason}</p>}
      </div>
    );
  }

  function getExemptionBadgeVariant(
    exemption: { isExempt: boolean; category: "waive" | "leave" | null },
    fallback: "success" | "warning" | "danger" | "neutral",
  ) {
    if (!exemption.isExempt) return fallback;
    return exemption.category === "leave" ? "warning" : "success";
  }

  function getExemptionBadgeLabel(
    exemption: { isExempt: boolean; label: string | null },
    fallback: string,
  ) {
    if (!exemption.isExempt) return fallback;
    return exemption.label ?? "免交";
  }

  function renderAccountMeta(account: AccountRow) {
    return (
      <div className="flex flex-wrap gap-1">
        {account.content_direction ? (
          <Badge variant="outline" className="text-[12px]">
            {account.content_direction}
          </Badge>
        ) : null}
        {account.presentation_format ? (
          <Badge variant="outline" className="text-[12px]">
            {account.presentation_format}
          </Badge>
        ) : null}
      </div>
    );
  }

  const unsubmittedProfileRows = profileRows.activeRows.filter((r) => !r.isSubmitted);
  const submittedProfileRowsList = profileRows.activeRows.filter((r) => r.isSubmitted);
  const profileTotalPages = Math.ceil(unsubmittedProfileRows.length / SS_PAGE_SIZE);
  const visibleUnsubmittedProfileRows = unsubmittedProfileRows.slice((profilePage - 1) * SS_PAGE_SIZE, profilePage * SS_PAGE_SIZE);

  const unsubmittedAccountRows = accountRows.activeRows.filter((r) => !r.isSubmitted);
  const submittedAccountRowsList = accountRows.activeRows.filter((r) => r.isSubmitted);
  const accountTotalPages = Math.ceil(unsubmittedAccountRows.length / SS_PAGE_SIZE);
  const visibleUnsubmittedAccountRows = unsubmittedAccountRows.slice((accountPage - 1) * SS_PAGE_SIZE, accountPage * SS_PAGE_SIZE);

  function renderPagination(
    page: number,
    totalPages: number,
    total: number,
    onPageChange: (p: number) => void,
  ) {
    if (total <= SS_PAGE_SIZE || totalPages <= 1) return null;
    return (
      <div className="flex flex-col items-center gap-2 pt-3">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)} className="h-8 px-3 text-xs rounded-xl">上一页</Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button key={p} size="sm" variant={p === page ? "default" : "outline"} onClick={() => onPageChange(p)} className={`h-8 w-8 p-0 text-xs rounded-xl ${p === page ? "bg-white border-[#D97757]/40 text-[#D97757] hover:bg-white hover:border-[#D97757]/60" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>{p}</Button>
          ))}
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} className="h-8 px-3 text-xs rounded-xl">下一页</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Card className="card-elevated bg-white border-zinc-200">
          <CardContent className="pt-6 pb-5">
            <p className="text-[12px] uppercase tracking-[0.25em] font-medium text-zinc-400">{summary.totalLabel}</p>
            <p className="text-[18px] font-semibold text-zinc-800 tracking-tight mt-2 font-mono tabular-nums">
              <AnimatedNumber value={summary.totalActive} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-white border-zinc-200">
          <CardContent className="pt-6 pb-5">
            <p className="text-[12px] uppercase tracking-[0.25em] font-medium text-[#6FAA7D]">已提交</p>
            <p className="text-[18px] font-semibold text-zinc-800 tracking-tight mt-2 font-mono tabular-nums">
              <AnimatedNumber value={summary.submittedCount} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-white border-zinc-200">
          <CardContent className="pt-6 pb-5">
            <p className="text-[12px] uppercase tracking-[0.25em] font-medium text-[#D99E55]">待提交</p>
            <p className="text-[18px] font-semibold text-zinc-800 tracking-tight mt-2 font-mono tabular-nums">
              <AnimatedNumber value={summary.unsubmittedCount} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-white border-zinc-200">
          <CardContent className="pt-6 pb-5">
            <p className="text-[12px] uppercase tracking-[0.25em] font-medium text-zinc-400">提交率</p>
            <p className="text-[18px] font-semibold text-zinc-800 tracking-tight mt-2 font-mono tabular-nums">
              <AnimatedNumber value={summary.submitRate} format={(n) => `${n}%`} />
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <CardTitle>提交状态</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={viewMode === "profile" ? "default" : "outline"} onClick={() => { setViewMode("profile"); setProfilePage(1); }}>
                  按人查看
                </Button>
                <Button size="sm" variant={viewMode === "account" ? "default" : "outline"} onClick={() => { setViewMode("account"); setAccountPage(1); }}>
                  按账号查看
                </Button>
              </div>
            </div>
            <Input
              type="date"
              value={date}
              onChange={handleDateChange}
              className="h-9 w-auto"
            />
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "profile" ? (
            <>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>账号数</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>账号摘要</TableHead>
                      <TableHead>豁免说明</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleUnsubmittedProfileRows.map((row) => (
                      <TableRow key={row.id} className="border-l-[2px] border-l-[#D99E55] hover:bg-zinc-50">
                        <TableCell className="font-medium text-zinc-800">{row.name}</TableCell>
                        <TableCell>
                          <Badge variant={row.role === "admin" ? "default" : row.role === "owner" ? "destructive" : "secondary"} className="text-xs">
                            {renderRole(row.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">{row.accountCount}</TableCell>
                        <TableCell>
                          <Badge
                            variant={getExemptionBadgeVariant(
                              row.exemption,
                              row.isSubmitted ? "success" : "warning",
                            )}
                            className="text-xs"
                          >
                            {getExemptionBadgeLabel(row.exemption, row.statusText)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.ownAccounts.length ? (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {row.ownAccounts.map((account) => (
                                <div key={account.id} className="flex items-center gap-2">
                                  <span>{account.name}</span>
                                  {submittedAccountSet.has(account.id) ? (
                                    <Badge variant="success" className="text-[12px] px-1 py-0">
                                      已交
                                    </Badge>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">暂无账号</span>
                          )}
                        </TableCell>
                        <TableCell>{renderExemptionHint(row.exemption.label, row.exemption.reason)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row)}
                            className="text-xs text-muted-foreground"
                          >
                            设置豁免
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {submittedProfileRowsList.length > 0 && (
                      <>
                        <TableRow
                          className="cursor-pointer hover:bg-zinc-50"
                          onClick={() => setProfileSubmittedExpanded((v) => !v)}
                        >
                          <TableCell colSpan={7} className="py-2 text-xs text-muted-foreground select-none">
                            已提交 {submittedProfileRowsList.length} 人 {profileSubmittedExpanded ? "▲" : "▼"}
                          </TableCell>
                        </TableRow>
                        {profileSubmittedExpanded && submittedProfileRowsList.map((row) => (
                          <TableRow key={row.id} className="border-l-[2px] border-l-[#6FAA7D] hover:bg-zinc-50">
                            <TableCell>{row.name}</TableCell>
                            <TableCell>
                              <Badge variant={row.role === "admin" ? "default" : row.role === "owner" ? "destructive" : "secondary"} className="text-xs">{renderRole(row.role)}</Badge>
                            </TableCell>
                            <TableCell className="font-mono tabular-nums">{row.accountCount}</TableCell>
                            <TableCell><Badge variant="success" className="text-xs">{row.statusText}</Badge></TableCell>
                            <TableCell>
                              {row.ownAccounts.length ? (
                                <div className="space-y-1 text-xs text-muted-foreground">
                                  {row.ownAccounts.map((account) => (
                                    <div key={account.id} className="flex items-center gap-2">
                                      <span>{account.name}</span>
                                      {submittedAccountSet.has(account.id) ? <Badge variant="success" className="text-[12px] px-1 py-0">已交</Badge> : null}
                                    </div>
                                  ))}
                                </div>
                              ) : <span className="text-xs text-muted-foreground">暂无账号</span>}
                            </TableCell>
                            <TableCell>{renderExemptionHint(row.exemption.label, row.exemption.reason)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => openDialog(row)} className="text-xs text-muted-foreground">设置豁免</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                    {profileRows.exemptRows.length > 0 && (
                      <>
                        <TableRow>
                          <TableCell colSpan={7} className="border-0 pt-4 pb-1 text-xs text-muted-foreground">
                            豁免人员（不计入提交统计）
                          </TableCell>
                        </TableRow>
                        {profileRows.exemptRows.map((row) => (
                          <TableRow key={row.id} className="bg-zinc-50 text-zinc-400 hover:bg-zinc-50">
                            <TableCell>{row.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {renderRole(row.role)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono tabular-nums">{row.accountCount}</TableCell>
                            <TableCell>
                              <Badge variant={getExemptionBadgeVariant(row.exemption, "neutral")} className="text-xs">
                                {getExemptionBadgeLabel(row.exemption, row.statusText)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-xs text-muted-foreground">
                                {row.ownAccounts.map((account) => (
                                  <p key={account.id}>{account.name}</p>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{renderExemptionHint(row.exemption.label, row.exemption.reason)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDialog(row)}
                                className="text-xs text-muted-foreground"
                              >
                                编辑
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
                {renderPagination(profilePage, profileTotalPages, unsubmittedProfileRows.length, setProfilePage)}
              </div>

              <div className="space-y-3 sm:hidden">
                {visibleUnsubmittedProfileRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-zinc-200 bg-white overflow-hidden"
                  >
                    <div className="h-[2px] bg-[#D99E55]" />
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-zinc-800">{row.name}</p>
                          <p className="text-xs text-zinc-500">{renderRole(row.role)} · {row.accountCount} 个账号</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="warning" className="text-[12px]">
                            {row.statusText}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row)}
                            className="h-7 px-2 text-xs text-zinc-500"
                          >
                            豁免
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 text-xs text-zinc-500">
                        {row.ownAccounts.length ? (
                          row.ownAccounts.map((account) => (
                            <div key={account.id} className="flex items-center justify-between gap-2">
                              <span>{account.name}</span>
                              <Badge className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-0 text-[12px] text-zinc-700">
                                <span className={`size-1.5 rounded-full ${submittedAccountSet.has(account.id) ? "bg-[#6FAA7D]" : "bg-[#D99E55]"}`} aria-hidden />
                                {submittedAccountSet.has(account.id) ? "已交" : "未交"}
                              </Badge>
                            </div>
                          ))
                        ) : (
                          <p>暂无账号</p>
                        )}
                        {renderExemptionHint(row.exemption.label, row.exemption.reason)}
                      </div>
                    </div>
                  </div>
                ))}
                {submittedProfileRowsList.length > 0 && (
                  <>
                    <button
                      className="active:translate-y-0 w-full pt-2 text-left text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setProfileSubmittedExpanded((v) => !v)}
                    >
                      已提交 {submittedProfileRowsList.length} 人 {profileSubmittedExpanded ? "▲" : "▼"}
                    </button>
                    {profileSubmittedExpanded && submittedProfileRowsList.map((row) => (
                      <div key={row.id} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
                        <div className="h-[2px] bg-[#6FAA7D]" />
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{row.name}</p>
                              <p className="text-xs text-zinc-500">{renderRole(row.role)} · {row.accountCount} 个账号</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge variant="success" className="text-[12px]">{row.statusText}</Badge>
                              <Button variant="ghost" size="sm" onClick={() => openDialog(row)} className="h-7 px-2 text-xs text-zinc-500">豁免</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {renderPagination(profilePage, profileTotalPages, unsubmittedProfileRows.length, setProfilePage)}
                {profileRows.exemptRows.length > 0 && (
                  <>
                    <p className="pt-2 text-xs text-muted-foreground">豁免人员</p>
                    {profileRows.exemptRows.map((row) => (
                      <div key={row.id} className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-zinc-400">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{row.name}</p>
                            <p className="text-xs text-zinc-500">{renderRole(row.role)} · {row.accountCount} 个账号</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row)}
                            className="h-7 px-2 text-xs text-zinc-500"
                          >
                            编辑
                          </Button>
                        </div>
                        <Badge variant={getExemptionBadgeVariant(row.exemption, "neutral")} className="text-xs">
                          {getExemptionBadgeLabel(row.exemption, row.statusText)}
                        </Badge>
                        {renderExemptionHint(row.exemption.label, row.exemption.reason)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>账号</TableHead>
                      <TableHead>所属人</TableHead>
                      <TableHead>标签</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>豁免说明</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleUnsubmittedAccountRows.map((row) => (
                      <TableRow key={row.id} className="border-l-[2px] border-l-[#D99E55] hover:bg-zinc-50">
                        <TableCell className="font-medium text-zinc-800">{row.name}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p>{row.profile_name}</p>
                            <p className="text-xs text-muted-foreground">{renderRole(row.profile.role)}</p>
                          </div>
                        </TableCell>
                        <TableCell>{renderAccountMeta(row)}</TableCell>
                        <TableCell>
                          <Badge variant={row.isSubmitted ? "success" : "warning"} className="text-xs">
                            {row.isSubmitted ? "已提交" : "未提交"}
                          </Badge>
                        </TableCell>
                        <TableCell>{renderExemptionHint(row.exemption.label, row.exemption.reason)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row.profile)}
                            className="text-xs text-muted-foreground"
                          >
                            设置豁免
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {submittedAccountRowsList.length > 0 && (
                      <>
                        <TableRow
                          className="cursor-pointer hover:bg-zinc-50"
                          onClick={() => setAccountSubmittedExpanded((v) => !v)}
                        >
                          <TableCell colSpan={6} className="py-2 text-xs text-muted-foreground select-none">
                            已提交 {submittedAccountRowsList.length} 个账号 {accountSubmittedExpanded ? "▲" : "▼"}
                          </TableCell>
                        </TableRow>
                        {accountSubmittedExpanded && submittedAccountRowsList.map((row) => (
                          <TableRow key={row.id} className="border-l-[2px] border-l-[#6FAA7D] hover:bg-zinc-50">
                            <TableCell>{row.name}</TableCell>
                            <TableCell>
                              <div className="space-y-1"><p>{row.profile_name}</p><p className="text-xs text-muted-foreground">{renderRole(row.profile.role)}</p></div>
                            </TableCell>
                            <TableCell>{renderAccountMeta(row)}</TableCell>
                            <TableCell><Badge variant="success" className="text-xs">已提交</Badge></TableCell>
                            <TableCell>{renderExemptionHint(row.exemption.label, row.exemption.reason)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => openDialog(row.profile)} className="text-xs text-muted-foreground">设置豁免</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                    {accountRows.exemptRows.length > 0 && (
                      <>
                        <TableRow>
                          <TableCell colSpan={6} className="border-0 pt-4 pb-1 text-xs text-muted-foreground">
                            豁免账号（继承所属人员豁免状态）
                          </TableCell>
                        </TableRow>
                        {accountRows.exemptRows.map((row) => (
                          <TableRow key={row.id} className="bg-zinc-50 text-zinc-400 hover:bg-zinc-50">
                            <TableCell>{row.name}</TableCell>
                            <TableCell>{row.profile_name}</TableCell>
                            <TableCell>{renderAccountMeta(row)}</TableCell>
                            <TableCell>
                              <Badge variant={getExemptionBadgeVariant(row.exemption, "neutral")} className="text-xs">
                                {getExemptionBadgeLabel(row.exemption, row.isSubmitted ? "已提交" : "未提交")}
                              </Badge>
                            </TableCell>
                            <TableCell>{renderExemptionHint(row.exemption.label, row.exemption.reason)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDialog(row.profile)}
                                className="text-xs text-muted-foreground"
                              >
                                编辑
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
                {renderPagination(accountPage, accountTotalPages, unsubmittedAccountRows.length, setAccountPage)}
              </div>

              <div className="space-y-3 sm:hidden">
                {visibleUnsubmittedAccountRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-zinc-200 bg-white overflow-hidden"
                  >
                    <div className="h-[2px] bg-[#D99E55]" />
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-zinc-800">{row.name}</p>
                          <p className="text-xs text-zinc-500">{row.profile_name} · {renderRole(row.profile.role)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="warning">未交</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row.profile)}
                            className="h-7 px-2 text-xs text-zinc-500"
                          >
                            豁免
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 text-xs text-zinc-500">
                        {renderAccountMeta(row)}
                        {renderExemptionHint(row.exemption.label, row.exemption.reason)}
                      </div>
                    </div>
                  </div>
                ))}
                {submittedAccountRowsList.length > 0 && (
                  <>
                    <button
                      className="active:translate-y-0 w-full pt-2 text-left text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setAccountSubmittedExpanded((v) => !v)}
                    >
                      已提交 {submittedAccountRowsList.length} 个账号 {accountSubmittedExpanded ? "▲" : "▼"}
                    </button>
                    {accountSubmittedExpanded && submittedAccountRowsList.map((row) => (
                      <div key={row.id} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
                        <div className="h-[2px] bg-[#6FAA7D]" />
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{row.name}</p>
                              <p className="text-xs text-zinc-500">{row.profile_name} · {renderRole(row.profile.role)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge variant="success">已交</Badge>
                              <Button variant="ghost" size="sm" onClick={() => openDialog(row.profile)} className="h-7 px-2 text-xs text-zinc-500">豁免</Button>
                            </div>
                          </div>
                          <div className="mt-3 space-y-2 text-xs text-zinc-500">
                            {renderAccountMeta(row)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {renderPagination(accountPage, accountTotalPages, unsubmittedAccountRows.length, setAccountPage)}
                {accountRows.exemptRows.length > 0 && (
                  <>
                    <p className="pt-2 text-xs text-muted-foreground">豁免账号</p>
                    {accountRows.exemptRows.map((row) => (
                      <div key={row.id} className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-zinc-400">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{row.name}</p>
                            <p className="text-xs text-zinc-500">{row.profile_name}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row.profile)}
                            className="h-7 px-2 text-xs text-zinc-500"
                          >
                            编辑
                          </Button>
                        </div>
                        <Badge variant={getExemptionBadgeVariant(row.exemption, "neutral")} className="text-xs">
                          {getExemptionBadgeLabel(row.exemption, row.isSubmitted ? "已交" : "未交")}
                        </Badge>
                        {renderAccountMeta(row)}
                        {renderExemptionHint(row.exemption.label, row.exemption.reason)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ExemptionDialog
        open={selectedProfile !== null}
        profile={selectedProfile}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProfile(null);
          }
        }}
      />
    </>
  );
}
