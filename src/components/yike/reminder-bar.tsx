"use client";

import * as React from "react";
import { AlertCircle, Clock, GitBranch, Target } from "lucide-react";
import { motion } from "framer-motion";
import type { YikeWorkbench } from "./types";

interface ReminderBarProps {
  reminders: YikeWorkbench["reminders"];
  /** 点项目缺下一步 → 打开项目补下一步 */
  onProjectNextTask?: (projectId: string, projectName: string) => void;
  /** 点备忘建议拆分 → 打开拆分 */
  onMemoSplit?: (itemId: string) => void;
}

const chipBase =
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors";

export function ReminderBar({ reminders, onProjectNextTask, onMemoSplit }: ReminderBarProps) {
  const { urgent, dueSoon, projectsMissingNextTask, memosSuggestSplit } = reminders;
  const empty =
    urgent.length === 0 &&
    dueSoon.length === 0 &&
    projectsMissingNextTask.length === 0 &&
    memosSuggestSplit.length === 0;

  if (empty) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="flex flex-wrap gap-2"
    >
      {urgent.length > 0 && (
        <span className={`${chipBase} border-[#C9604D]/20 bg-[#C9604D]/[0.06] text-[#C9604D]`}>
          <AlertCircle className="h-3.5 w-3.5" />
          {urgent.length} 件事项加急
        </span>
      )}
      {dueSoon.length > 0 && (
        <span className={`${chipBase} border-[#D99E55]/25 bg-[#D99E55]/[0.07] text-[#B07B2E]`}>
          <Clock className="h-3.5 w-3.5" />
          {dueSoon.length} 件即将截止
        </span>
      )}
      {projectsMissingNextTask.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => onProjectNextTask?.(project.id, project.name)}
          className={`${chipBase} border-[#C9A227]/25 bg-[#C9A227]/[0.08] text-[#8A6D0F] hover:bg-[#C9A227]/[0.14]`}
        >
          <Target className="h-3.5 w-3.5" />
          项目【{project.name}】缺下一步
        </button>
      ))}
      {memosSuggestSplit.map((memo) => (
        <button
          key={memo.id}
          type="button"
          onClick={() => onMemoSplit?.(memo.id)}
          className={`${chipBase} border-[#5B8DB8]/25 bg-[#5B8DB8]/[0.08] text-[#3D6E99] hover:bg-[#5B8DB8]/[0.14]`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          备忘【{memo.title}】建议拆分
        </button>
      ))}
    </motion.div>
  );
}
