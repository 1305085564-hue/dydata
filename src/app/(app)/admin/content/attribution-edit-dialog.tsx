"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { feedbackToast } from "@/components/ui/feedback-toast";

interface OperatorMemberOption {
  id: string;
  name: string;
  display_name: string;
  department: string | null;
}

interface AttributionEditDialogProps {
  video: {
    id: string;
    user_id: string;
    published_at: string | null;
    uploaded_at: string;
    created_at?: string;
    script_author_user_id?: string | null;
    video_editor_user_id?: string | null;
    operator_user_id?: string | null;
    profiles?: { name: string };
  };
  onSuccess?: () => void;
}

const NONE_VALUE = "__NULL__";

export function AttributionEditDialog({ video, onSuccess }: AttributionEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<OperatorMemberOption[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [scriptAuthorUserId, setScriptAuthorUserId] = useState<string>(
    video.script_author_user_id ?? video.user_id,
  );
  const [videoEditorUserId, setVideoEditorUserId] = useState<string>(
    video.video_editor_user_id ?? video.user_id,
  );
  const [operatorUserId, setOperatorUserId] = useState<string>(
    video.operator_user_id ?? video.user_id,
  );

  const handleOpenDialog = () => {
    setScriptAuthorUserId(video.script_author_user_id ?? video.user_id);
    setVideoEditorUserId(video.video_editor_user_id ?? video.user_id);
    setOperatorUserId(video.operator_user_id ?? video.user_id);
    setOpen(true);

    if (members.length === 0) {
      setLoadingMembers(true);
      fetch("/api/dashboard/operator-members")
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "加载成员列表失败");
          return data.members as OperatorMemberOption[];
        })
        .then((mList) => {
          setMembers(mList ?? []);
        })
        .catch((err) => {
          feedbackToast.error("加载责任人列表失败: " + String(err));
        })
        .finally(() => {
          setLoadingMembers(false);
        });
    }
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/collaboration/attribution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: video.id,
          scriptAuthorUserId: scriptAuthorUserId === NONE_VALUE ? null : scriptAuthorUserId,
          videoEditorUserId: videoEditorUserId === NONE_VALUE ? null : videoEditorUserId,
          operatorUserId: operatorUserId === NONE_VALUE ? null : operatorUserId,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        feedbackToast.error("更新失败: " + (json.error || "更新岗位归属错误"));
        return;
      }

      if (json.videoUpdated === false) {
        feedbackToast.success("归属已更新（视频侧未找到对应记录，仅更新了日报）");
      } else {
        feedbackToast.success("归属已更新");
      }

      setOpen(false);
      onSuccess?.();
    } catch (err) {
      feedbackToast.error("请求失败: " + String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={handleOpenDialog}
              className="flex size-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="text-[12px]">修改归属</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-zinc-900">修改岗位归属</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-[13px]">
            {/* 文案选人 */}
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">文案责任人：</label>
              <Select
                value={scriptAuthorUserId}
                onValueChange={(val) => val && setScriptAuthorUserId(val)}
                disabled={loadingMembers}
              >
                <SelectTrigger className="w-full h-9 bg-zinc-50 border-zinc-200">
                  <SelectValue placeholder="选择文案责任人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={video.user_id}>自运营（提交人: {video.profiles?.name || "本号达人"}）</SelectItem>
                  <SelectItem value={NONE_VALUE} className="text-zinc-400">未配置 / 留空</SelectItem>
                  {members
                    .filter((m) => m.id !== video.user_id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.department ? `(${m.department})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* 剪辑选人 */}
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">剪辑责任人：</label>
              <Select
                value={videoEditorUserId}
                onValueChange={(val) => val && setVideoEditorUserId(val)}
                disabled={loadingMembers}
              >
                <SelectTrigger className="w-full h-9 bg-zinc-50 border-zinc-200">
                  <SelectValue placeholder="选择剪辑责任人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={video.user_id}>自运营（提交人: {video.profiles?.name || "本号达人"}）</SelectItem>
                  <SelectItem value={NONE_VALUE} className="text-zinc-400">未配置 / 留空</SelectItem>
                  {members
                    .filter((m) => m.id !== video.user_id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.department ? `(${m.department})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* 运营选人 */}
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">运营责任人：</label>
              <Select
                value={operatorUserId}
                onValueChange={(val) => val && setOperatorUserId(val)}
                disabled={loadingMembers}
              >
                <SelectTrigger className="w-full h-9 bg-zinc-50 border-zinc-200">
                  <SelectValue placeholder="选择运营责任人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={video.user_id}>自运营（提交人: {video.profiles?.name || "本号达人"}）</SelectItem>
                  <SelectItem value={NONE_VALUE} className="text-zinc-400">未配置 / 留空</SelectItem>
                  {members
                    .filter((m) => m.id !== video.user_id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.department ? `(${m.department})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button
              size="sm"
              className="bg-[#D97757] text-white hover:bg-[#C96442]"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? "提交中…" : "确认修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
