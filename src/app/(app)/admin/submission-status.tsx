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

  function renderAccountMeta(account: AccountRow) {
    return (
      <div className="flex flex-wrap gap-1">
        {account.content_direction ? (
          <Badge variant="outline" className="text-[11px]">
            {account.content_direction}
          </Badge>
        ) : null}
        {account.presentation_format ? (
          <Badge variant="outline" className="text-[11px]">
            {account.presentation_format}
          </Badge>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="card-elevated bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-blue-400 uppercase tracking-wide">{summary.totalLabel}</p>
            <p className="text-3xl font-bold text-blue-700 mt-1">
              <AnimatedNumber value={summary.totalActive} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-gradient-to-br from-green-50 to-white border-green-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-green-400 uppercase tracking-wide">已提交</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              <AnimatedNumber value={summary.submittedCount} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-gradient-to-br from-orange-50 to-white border-orange-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-orange-400 uppercase tracking-wide">待提交</p>
            <p className="text-3xl font-bold text-orange-500 mt-1">
              <AnimatedNumber value={summary.unsubmittedCount} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-gradient-to-br from-violet-50 to-white border-violet-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-violet-400 uppercase tracking-wide">提交率</p>
            <p className="text-3xl font-bold text-violet-600 mt-1">
              <AnimatedNumber value={summary.submitRate} suffix="%" />
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <CardTitle>提交状态</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={viewMode === "profile" ? "default" : "outline"} onClick={() => setViewMode("profile")}>
                  按人查看
                </Button>
                <Button size="sm" variant={viewMode === "account" ? "default" : "outline"} onClick={() => setViewMode("account")}>
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
                    {profileRows.activeRows.map((row) => (
                      <TableRow key={row.id} className={!row.isSubmitted ? "bg-red-50/70" : ""}>
                        <TableCell className={!row.isSubmitted ? "font-medium text-red-600" : ""}>{row.name}</TableCell>
                        <TableCell>
                          <Badge variant={row.role === "admin" ? "default" : row.role === "owner" ? "destructive" : "secondary"} className="text-xs">
                            {renderRole(row.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{row.accountCount}</TableCell>
                        <TableCell>
                          <Badge
                            variant={row.isSubmitted ? "default" : row.isPartial ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {row.exemption.isExempt ? "豁免中" : row.statusText}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.ownAccounts.length ? (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {row.ownAccounts.map((account) => (
                                <div key={account.id} className="flex items-center gap-2">
                                  <span>{account.name}</span>
                                  {submittedAccountSet.has(account.id) ? (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
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
                    {profileRows.exemptRows.length > 0 && (
                      <>
                        <TableRow>
                          <TableCell colSpan={7} className="border-0 pt-4 pb-1 text-xs text-muted-foreground">
                            豁免人员（不计入提交统计）
                          </TableCell>
                        </TableRow>
                        {profileRows.exemptRows.map((row) => (
                          <TableRow key={row.id} className="opacity-60">
                            <TableCell>{row.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {renderRole(row.role)}
                              </Badge>
                            </TableCell>
                            <TableCell className="tabular-nums">{row.accountCount}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {row.statusText}
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
              </div>

              <div className="space-y-3 sm:hidden">
                {profileRows.activeRows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-lg border p-3 ${!row.isSubmitted ? "border-red-200 bg-red-50/70" : "bg-background"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className={`text-sm font-medium ${!row.isSubmitted ? "text-red-600" : ""}`}>{row.name}</p>
                        <p className="text-xs text-muted-foreground">{renderRole(row.role)} · {row.accountCount} 个账号</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={row.isSubmitted ? "default" : row.isPartial ? "secondary" : "destructive"} className="text-xs">
                          {row.statusText}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(row)}
                          className="h-7 px-2 text-xs text-muted-foreground"
                        >
                          豁免
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {row.ownAccounts.length ? (
                        row.ownAccounts.map((account) => (
                          <div key={account.id} className="flex items-center justify-between gap-2">
                            <span>{account.name}</span>
                            <Badge variant={submittedAccountSet.has(account.id) ? "outline" : "secondary"} className="text-[10px] px-1 py-0">
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
                ))}
                {profileRows.exemptRows.length > 0 && (
                  <>
                    <p className="pt-2 text-xs text-muted-foreground">豁免人员</p>
                    {profileRows.exemptRows.map((row) => (
                      <div key={row.id} className="space-y-2 rounded-lg border bg-background p-3 opacity-60">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{renderRole(row.role)} · {row.accountCount} 个账号</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row)}
                            className="h-7 px-2 text-xs text-muted-foreground"
                          >
                            编辑
                          </Button>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {row.statusText}
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
                    {accountRows.activeRows.map((row) => (
                      <TableRow key={row.id} className={!row.isSubmitted ? "bg-red-50/70" : ""}>
                        <TableCell className={!row.isSubmitted ? "font-medium text-red-600" : ""}>{row.name}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p>{row.profile_name}</p>
                            <p className="text-xs text-muted-foreground">{renderRole(row.profile.role)}</p>
                          </div>
                        </TableCell>
                        <TableCell>{renderAccountMeta(row)}</TableCell>
                        <TableCell>
                          <Badge variant={row.isSubmitted ? "default" : "destructive"} className="text-xs">
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
                    {accountRows.exemptRows.length > 0 && (
                      <>
                        <TableRow>
                          <TableCell colSpan={6} className="border-0 pt-4 pb-1 text-xs text-muted-foreground">
                            豁免账号（继承所属人员豁免状态）
                          </TableCell>
                        </TableRow>
                        {accountRows.exemptRows.map((row) => (
                          <TableRow key={row.id} className="opacity-60">
                            <TableCell>{row.name}</TableCell>
                            <TableCell>{row.profile_name}</TableCell>
                            <TableCell>{renderAccountMeta(row)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
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
                                编辑
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 sm:hidden">
                {accountRows.activeRows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-lg border p-3 ${!row.isSubmitted ? "border-red-200 bg-red-50/70" : "bg-background"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className={`text-sm font-medium ${!row.isSubmitted ? "text-red-600" : ""}`}>{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.profile_name} · {renderRole(row.profile.role)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={row.isSubmitted ? "default" : "destructive"} className="text-xs">
                          {row.isSubmitted ? "已交" : "未交"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(row.profile)}
                          className="h-7 px-2 text-xs text-muted-foreground"
                        >
                          豁免
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {renderAccountMeta(row)}
                      {renderExemptionHint(row.exemption.label, row.exemption.reason)}
                    </div>
                  </div>
                ))}
                {accountRows.exemptRows.length > 0 && (
                  <>
                    <p className="pt-2 text-xs text-muted-foreground">豁免账号</p>
                    {accountRows.exemptRows.map((row) => (
                      <div key={row.id} className="space-y-2 rounded-lg border bg-background p-3 opacity-60">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{row.profile_name}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(row.profile)}
                            className="h-7 px-2 text-xs text-muted-foreground"
                          >
                            编辑
                          </Button>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {row.isSubmitted ? "已交" : "未交"}
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
