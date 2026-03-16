"use client";

import { useState } from "react";
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

interface SubmissionStatusProps {
  profiles: Profile[];
  submittedIds: string[];
  defaultDate: string;
}

export function SubmissionStatus({ profiles, submittedIds, defaultDate }: SubmissionStatusProps) {
  const [date, setDate] = useState(defaultDate);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const router = useRouter();

  const submittedSet = new Set(submittedIds);

  const profileStates = profiles.map((profile) => {
    const exemption = getExemptionStateForDate(profile, date);
    return {
      ...profile,
      exemption,
    };
  });

  const activeProfiles = profileStates.filter((p) => !p.exemption.isExempt);
  const exemptProfiles = profileStates.filter((p) => p.exemption.isExempt);

  const sorted = [...activeProfiles].sort((a, b) => {
    const aSubmitted = submittedSet.has(a.id);
    const bSubmitted = submittedSet.has(b.id);
    if (aSubmitted === bSubmitted) return 0;
    return aSubmitted ? 1 : -1;
  });

  const totalActive = activeProfiles.length;
  const submittedCount = activeProfiles.filter((p) => submittedSet.has(p.id)).length;
  const unsubmittedCount = totalActive - submittedCount;
  const submitRate = totalActive > 0 ? Math.round((submittedCount / totalActive) * 100) : 0;

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

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="card-elevated bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-blue-400 uppercase tracking-wide">在岗人数</p>
            <p className="text-3xl font-bold text-blue-700 mt-1">
              <AnimatedNumber value={totalActive} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-gradient-to-br from-green-50 to-white border-green-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-green-400 uppercase tracking-wide">已提交</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              <AnimatedNumber value={submittedCount} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-gradient-to-br from-orange-50 to-white border-orange-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-orange-400 uppercase tracking-wide">未提交</p>
            <p className="text-3xl font-bold text-orange-500 mt-1">
              <AnimatedNumber value={unsubmittedCount} />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated bg-gradient-to-br from-violet-50 to-white border-violet-100">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-medium text-violet-400 uppercase tracking-wide">提交率</p>
            <p className="text-3xl font-bold text-violet-600 mt-1">
              <AnimatedNumber value={submitRate} suffix="%" />
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>提交状态</CardTitle>
            <Input
              type="date"
              value={date}
              onChange={handleDateChange}
              className="w-auto h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>豁免说明</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((p) => {
                  const submitted = submittedSet.has(p.id);
                  return (
                    <TableRow key={p.id} className={!submitted ? "bg-red-50" : ""}>
                      <TableCell className={!submitted ? "text-red-600 font-medium" : ""}>{p.name}</TableCell>
                      <TableCell>
                        <Badge variant={p.role === "admin" ? "default" : p.role === "owner" ? "destructive" : "secondary"} className="text-xs">
                          {renderRole(p.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={submitted ? "default" : "destructive"}>
                          {submitted ? "已提交" : "未提交"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {renderExemptionHint(p.exemption.label, p.exemption.reason)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(p)}
                          className="text-xs text-muted-foreground"
                        >
                          设置豁免
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {exemptProfiles.length > 0 && (
                  <>
                    <TableRow>
                      <TableCell colSpan={5} className="text-xs text-muted-foreground pt-4 pb-1 border-0">
                        豁免人员（不计入提交统计）
                      </TableCell>
                    </TableRow>
                    {exemptProfiles.map((p) => (
                      <TableRow key={p.id} className="opacity-60">
                        <TableCell>{p.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{renderRole(p.role)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">豁免中</Badge>
                        </TableCell>
                        <TableCell>
                          {renderExemptionHint(p.exemption.label, p.exemption.reason)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(p)}
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

          <div className="sm:hidden space-y-3">
            {sorted.map((p) => {
              const submitted = submittedSet.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-3 ${!submitted ? "bg-red-50 border-red-200" : "bg-background"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${submitted ? "bg-green-500" : "bg-red-500"}`} />
                      <div>
                        <p className={`text-sm font-medium ${!submitted ? "text-red-600" : ""}`}>{p.name}</p>
                        <p className="text-xs text-muted-foreground">{renderRole(p.role)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={submitted ? "default" : "destructive"} className="text-xs">
                        {submitted ? "已交" : "未交"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(p)}
                        className="text-xs text-muted-foreground h-7 px-2"
                      >
                        豁免
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    {renderExemptionHint(p.exemption.label, p.exemption.reason)}
                  </div>
                </div>
              );
            })}
            {exemptProfiles.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground pt-2">豁免人员</p>
                {exemptProfiles.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3 opacity-60 bg-background space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-gray-300" />
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{renderRole(p.role)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(p)}
                        className="text-xs text-muted-foreground h-7 px-2"
                      >
                        编辑
                      </Button>
                    </div>
                    {renderExemptionHint(p.exemption.label, p.exemption.reason)}
                  </div>
                ))}
              </>
            )}
          </div>
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
