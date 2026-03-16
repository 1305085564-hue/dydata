"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { toggleExempt } from "./actions";

interface Profile {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface SubmissionStatusProps {
  profiles: Profile[];
  submittedIds: string[];
  defaultDate: string;
}

export function SubmissionStatus({ profiles, submittedIds, defaultDate }: SubmissionStatusProps) {
  const [date, setDate] = useState(defaultDate);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submittedSet = new Set(submittedIds);

  const activeProfiles = profiles.filter((p) => p.status !== "exempt");
  const exemptProfiles = profiles.filter((p) => p.status === "exempt");

  // 未提交排前面
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

  function handleToggleExempt(userId: string, currentStatus: string) {
    startTransition(async () => {
      const result = await toggleExempt(userId, currentStatus);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(currentStatus === "exempt" ? "已恢复正常状态" : "已设为豁免");
      }
    });
  }

  return (
    <>
      {/* Stats */}
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

      {/* Submission status */}
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
          {/* 桌面端：表格 */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
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
                        <Badge variant={p.role === "admin" ? "default" : "secondary"} className="text-xs">
                          {p.role === "admin" ? "管理员" : "成员"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={submitted ? "default" : "destructive"}>
                          {submitted ? "已提交" : "未提交"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleToggleExempt(p.id, p.status ?? "active")}
                          className="text-xs text-muted-foreground"
                        >
                          设为豁免
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {exemptProfiles.length > 0 && (
                  <>
                    <TableRow>
                      <TableCell colSpan={4} className="text-xs text-muted-foreground pt-4 pb-1 border-0">
                        豁免人员（不计入提交统计）
                      </TableCell>
                    </TableRow>
                    {exemptProfiles.map((p) => (
                      <TableRow key={p.id} className="opacity-50">
                        <TableCell>{p.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">豁免</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">—</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleToggleExempt(p.id, "exempt")}
                            className="text-xs text-muted-foreground"
                          >
                            恢复
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          {/* 手机端：卡片列表 */}
          <div className="sm:hidden space-y-3">
            {sorted.map((p) => {
              const submitted = submittedSet.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    !submitted ? "bg-red-50 border-red-200" : "bg-background"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${submitted ? "bg-green-500" : "bg-red-500"}`} />
                    <div>
                      <p className={`text-sm font-medium ${!submitted ? "text-red-600" : ""}`}>{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.role === "admin" ? "管理员" : "成员"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={submitted ? "default" : "destructive"} className="text-xs">
                      {submitted ? "已交" : "未交"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleToggleExempt(p.id, p.status ?? "active")}
                      className="text-xs text-muted-foreground h-7 px-2"
                    >
                      豁免
                    </Button>
                  </div>
                </div>
              );
            })}
            {exemptProfiles.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground pt-2">豁免人员</p>
                {exemptProfiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3 opacity-50">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-gray-300" />
                      <p className="text-sm">{p.name}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleToggleExempt(p.id, "exempt")}
                      className="text-xs text-muted-foreground h-7 px-2"
                    >
                      恢复
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
