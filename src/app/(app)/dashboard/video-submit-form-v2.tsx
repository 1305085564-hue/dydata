"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Image as ImageIcon, 
  Sparkles, 
  Upload, 
  UserCheck, 
  Zap, 
  Loader2, 
  AlertTriangle,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SubmissionRoleAssignments } from "./video-submit-form-state";

export interface AccountItem {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

export interface VideoSubmitFormV2Props {
  accounts: AccountItem[];
  userId: string;
  userDisplayName: string;
  today: string;
  activeBizDate?: string;
  initialSummary?: any;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

type AnomalyStatus = "normal" | "abnormal";

export function VideoSubmitFormV2({
  accounts,
  userId,
  userDisplayName,
  today,
  activeBizDate = today,
  initialSummary,
  onSubmitSuccess,
  onCancel,
}: VideoSubmitFormV2Props) {
  // 1. 账号与基础字段
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialSummary?.accountId || accounts[0]?.id || ""
  );
  const [anomalyStatus, setAnomalyStatus] = useState<AnomalyStatus>("normal");
  const [videoTitle, setVideoTitle] = useState(initialSummary?.title || "");
  const [content, setContent] = useState(initialSummary?.content || "");
  const [topicId, setTopicId] = useState<string | null>(null);

  // 2. 团队三工种归属 (默认为当前登录用户)
  const [assignments, setAssignments] = useState<SubmissionRoleAssignments>({
    scriptAuthorUserId: userId,
    videoEditorUserId: userId,
    operatorUserId: userId,
  });

  // 3. 异常状态字段
  const [punishType, setPunishType] = useState<string>("flow_limit");
  const [platformNotice, setPlatformNotice] = useState<string>("");
  const [appeal, setAppeal] = useState<string>("");

  // 4. 数据指标
  const [playCount, setPlayCount] = useState<string>(initialSummary?.playCount?.toString() || "");
  const [completionRate, setCompletionRate] = useState<string>(initialSummary?.completionRate || "");
  const [bounceRate2s, setBounceRate2s] = useState<string>(initialSummary?.bounceRate2s || "");
  const [completionRate5s, setCompletionRate5s] = useState<string>(initialSummary?.completionRate5s || "");
  const [avgPlayDuration, setAvgPlayDuration] = useState<string>(initialSummary?.avgPlayDuration || "");
  const [likes, setLikes] = useState<string>(initialSummary?.likes?.toString() || "");
  const [comments, setComments] = useState<string>(initialSummary?.comments?.toString() || "");
  const [shares, setShares] = useState<string>(initialSummary?.shares?.toString() || "");
  const [favorites, setFavorites] = useState<string>(initialSummary?.favorites?.toString() || "");
  const [followerGain, setFollowerGain] = useState<string>(initialSummary?.followerGain?.toString() || "");

  // 5. 截图素材与状态机
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  
  // 6. UI 交互状态 (6 大标准状态机制)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shakeError, setShakeError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // 触发阻力震动 Feedback
  const triggerShake = (errMsg: string) => {
    setFormError(errMsg);
    setShakeError(true);
    setTimeout(() => setShakeError(false), 500);
  };

  // 截图上传处理 (对接 /api/submission-screenshots)
  const handleScreenshotUpload = async (file: File) => {
    setUploadingScreenshot(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/submission-screenshots", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "截图上传失败");
      }

      setScreenshotUrl(json.url);
      toast.success("数据截图上传成功");

      // 如果后端自带 OCR 提取数据则自动帮填充
      if (json.ocrData) {
        if (json.ocrData.play_count) setPlayCount(String(json.ocrData.play_count));
        if (json.ocrData.completion_rate) setCompletionRate(String(json.ocrData.completion_rate));
        if (json.ocrData.likes) setLikes(String(json.ocrData.likes));
      }
    } catch (err: any) {
      toast.error(err.message || "上传失败");
    } finally {
      setUploadingScreenshot(false);
    }
  };

  // 表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 前端基础校验
    if (!selectedAccountId) {
      triggerShake("请选择提交账号");
      return;
    }

    if (anomalyStatus === "normal") {
      if (!videoTitle.trim()) {
        triggerShake("请输入视频作品标题");
        return;
      }
      if (!content.trim()) {
        triggerShake("请输入视频文案/脚本");
        return;
      }
    } else {
      if (!content.trim()) {
        triggerShake("流量处罚/异常报备时，请说明文案或情况");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const assets = screenshotUrl
        ? [{ url: screenshotUrl, type: "data_screenshot" }]
        : [];

      const payload = {
        biz_date: activeBizDate,
        account_id: selectedAccountId,
        video_title: videoTitle.trim() || null,
        content: content.trim(),
        topic_id: topicId,
        anomaly_status: anomalyStatus,
        punish_type: anomalyStatus === "abnormal" ? punishType : null,
        platform_notice: anomalyStatus === "abnormal" ? platformNotice.trim() || null : null,
        appeal: anomalyStatus === "abnormal" ? appeal.trim() || null : null,
        script_author_user_id: assignments.scriptAuthorUserId,
        video_editor_user_id: assignments.videoEditorUserId,
        operator_user_id: assignments.operatorUserId,
        assets,
        metrics: {
          play_count: playCount ? Number(playCount) : 0,
          completion_rate: completionRate || "0",
          bounce_rate_2s: bounceRate2s || "0",
          completion_rate_5s: completionRate5s || "0",
          avg_play_duration: avgPlayDuration || "0",
          likes: likes ? Number(likes) : 0,
          comments: comments ? Number(comments) : 0,
          shares: shares ? Number(shares) : 0,
          favorites: favorites ? Number(favorites) : 0,
          follower_gain: followerGain ? Number(followerGain) : 0,
        },
      };

      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "提交数据失败");
      }

      setIsSuccess(true);
      toast.success(activeBizDate === today ? "今日数据提交成功！" : `日期 ${activeBizDate} 数据补交成功！`);

      setTimeout(() => {
        onSubmitSuccess?.();
      }, 800);
    } catch (err: any) {
      triggerShake(err.message || "请求服务器出错，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm",
        shakeError && "animate-shake"
      )}
    >
      {/* 头部：标题与发布类型切换 */}
      <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-zinc-900 flex items-center gap-2">
            <Zap className="size-5 text-[#D97757]" />
            {activeBizDate === today ? "数据填报 (今日)" : `补交日报 (${activeBizDate})`}
          </h2>
          <p className="mt-1 text-[13px] text-zinc-500">
            录入核心播放指标与分工责任，助推数据复盘与增长分析
          </p>
        </div>

        {/* 状态切换 Segmented Control (冷灰石墨/纸感白) */}
        <div className="inline-flex rounded-lg bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setAnomalyStatus("normal")}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-150",
              anomalyStatus === "normal"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            正常发布
          </button>
          <button
            type="button"
            onClick={() => setAnomalyStatus("abnormal")}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-150 flex items-center gap-1.5",
              anomalyStatus === "abnormal"
                ? "bg-red-50 text-red-700 shadow-sm border border-red-200"
                : "text-zinc-500 hover:text-red-600"
            )}
          >
            <AlertTriangle className="size-3.5" />
            流量处罚 / 异常
          </button>
        </div>
      </div>

      {/* 错误白话提示 */}
      {formError && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-[13px] text-red-600 border border-red-100">
          <AlertCircle className="size-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* 表单内容区域 */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        
        {/* 1. 账号与基础基本信息 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-[13px] font-medium text-zinc-700">发布账号 <span className="text-[#D97757]">*</span></Label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-[14px] text-zinc-800 shadow-sm focus:border-zinc-400 focus:outline-none"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.display_name} ({acc.name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-[13px] font-medium text-zinc-700">
              视频作品标题 {anomalyStatus === "normal" && <span className="text-[#D97757]">*</span>}
            </Label>
            <Input
              type="text"
              placeholder="请输入短视频标题..."
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              className="mt-1.5 text-[14px]"
            />
          </div>
        </div>

        {/* 文案内容 */}
        <div>
          <Label className="text-[13px] font-medium text-zinc-700">
            视频脚本 / 文案内容 <span className="text-[#D97757]">*</span>
          </Label>
          <Textarea
            rows={4}
            placeholder="贴入完整视频文案脚本，系统将自动识别关联标签..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1.5 text-[14px] resize-none"
          />
        </div>

        {/* 流量处罚拓展项 */}
        {anomalyStatus === "abnormal" && (
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 space-y-3">
            <h4 className="text-[13px] font-semibold text-red-800 flex items-center gap-1.5">
              <AlertTriangle className="size-4" />
              异常处罚信息报备
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-[12px] font-medium text-zinc-600">处罚类型</Label>
                <select
                  value={punishType}
                  onChange={(e) => setPunishType(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px]"
                >
                  <option value="flow_limit">限流 / 限制推荐</option>
                  <option value="remove_video">下架 / 封禁作品</option>
                  <option value="account_ban">账号警告 / 封禁</option>
                  <option value="other">其他异常</option>
                </select>
              </div>
              <div>
                <Label className="text-[12px] font-medium text-zinc-600">申诉进展</Label>
                <Input
                  placeholder="如：申诉中、申诉通过、放弃申诉..."
                  value={appeal}
                  onChange={(e) => setAppeal(e.target.value)}
                  className="mt-1 text-[13px]"
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. 数据指标录入区 */}
        <div className="rounded-xl border border-zinc-200/60 bg-zinc-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-medium text-zinc-900 flex items-center gap-1.5">
              <FileText className="size-4 text-zinc-500" />
              核心播放指标录入
            </h3>
            <span className="text-[12px] text-zinc-400">支持截图自动识别或手动录入</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-[12px] text-zinc-600">24h 播放量</Label>
              <Input
                type="number"
                placeholder="0"
                value={playCount}
                onChange={(e) => setPlayCount(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>
            <div>
              <Label className="text-[12px] text-zinc-600">完播率 (%)</Label>
              <Input
                type="text"
                placeholder="如 15.5%"
                value={completionRate}
                onChange={(e) => setCompletionRate(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>
            <div>
              <Label className="text-[12px] text-zinc-600">2s 跳出率 (%)</Label>
              <Input
                type="text"
                placeholder="如 40%"
                value={bounceRate2s}
                onChange={(e) => setBounceRate2s(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>
            <div>
              <Label className="text-[12px] text-zinc-600">点赞数</Label>
              <Input
                type="number"
                placeholder="0"
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>

            <div>
              <Label className="text-[12px] text-zinc-600">评论数</Label>
              <Input
                type="number"
                placeholder="0"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>
            <div>
              <Label className="text-[12px] text-zinc-600">分享数</Label>
              <Input
                type="number"
                placeholder="0"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>
            <div>
              <Label className="text-[12px] text-zinc-600">收藏数</Label>
              <Input
                type="number"
                placeholder="0"
                value={favorites}
                onChange={(e) => setFavorites(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>
            <div>
              <Label className="text-[12px] text-zinc-600">涨粉数</Label>
              <Input
                type="number"
                placeholder="0"
                value={followerGain}
                onChange={(e) => setFollowerGain(e.target.value)}
                className="mt-1 text-[13px] bg-white"
              />
            </div>
          </div>
        </div>

        {/* 3. 截图上传与识别区 */}
        <div>
          <Label className="text-[13px] font-medium text-zinc-700">数据截图凭证</Label>
          <div className="mt-1.5 flex items-center gap-4">
            <label className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-4 hover:border-zinc-400 hover:bg-zinc-50/50 transition-all">
              <Upload className="size-5 text-zinc-400" />
              <span className="mt-1 text-[12px] text-zinc-600">
                {uploadingScreenshot ? "正在上传解析..." : "点击或拖拽上传创作者后台截图"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingScreenshot}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScreenshotUpload(file);
                }}
              />
            </label>

            {screenshotUrl && (
              <div className="relative size-20 rounded-lg border border-zinc-200 overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotUrl} alt="截图凭证" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setScreenshotUrl(null)}
                  className="absolute top-1 right-1 rounded-full bg-zinc-900/60 p-1 text-white hover:bg-zinc-900"
                >
                  <RotateCcw className="size-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部操作与 CTA 按钮区 (暖橙 #D97757 唯一主 CTA) */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              className="text-[13px]"
            >
              取消
            </Button>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || isSuccess}
            className={cn(
              "bg-[#D97757] text-white hover:bg-[#C46A4D] active:scale-[0.97] transition-all px-6 py-2 rounded-md font-medium text-[14px] shadow-sm flex items-center gap-2",
              (isSubmitting || isSuccess) && "opacity-80 cursor-not-allowed"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                正在提交中...
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="size-4" />
                提交成功！
              </>
            ) : (
              <>
                <Zap className="size-4 fill-white/20" />
                确认提交数据
              </>
            )}
          </Button>
        </div>

      </form>
    </motion.div>
  );
}
