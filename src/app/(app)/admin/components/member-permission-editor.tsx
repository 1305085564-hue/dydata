"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { Shield, ShieldAlert, Check, Sparkles, Building2, Users, User, Info, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PERMISSION_CATEGORIES,
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_KEYS,
} from "@/types";
import type { DataScope, PermissionCategory, PermissionKey, Permissions, UserRole } from "@/types";
import type { PermissionManagerMember } from "../权限管理";

export interface MemberPermissionEditorProps {
  member: PermissionManagerMember;
  canEdit?: boolean;
  isSaving?: boolean;
  onSave: (permissions: Permissions, dataScope: DataScope) => Promise<void> | void;
  onCancel?: () => void;
}

const CATEGORY_ICONS: Record<PermissionCategory, typeof Shield> = {
  business: Building2,
  content: Sparkles,
  admin: Shield,
  ai: Sparkles,
};

const DATA_SCOPE_OPTIONS: Array<{
  value: DataScope;
  label: string;
  sublabel: string;
  icon: typeof User;
}> = [
  {
    value: "self",
    label: "仅自己",
    sublabel: "仅查看和统计个人数据",
    icon: User,
  },
  {
    value: "team",
    label: "同团队",
    sublabel: "可查看所属团队全体数据",
    icon: Users,
  },
  {
    value: "all",
    label: "全公司",
    sublabel: "跨团队查看全公司数据",
    icon: Building2,
  },
];

export function MemberPermissionEditor({
  member,
  canEdit = true,
  isSaving = false,
  onSave,
  onCancel,
}: MemberPermissionEditorProps) {
  const isOwner = member.role === "owner";

  // 计算初始权限与数据范围
  const initialPermissions = useMemo<Permissions>(() => {
    if (isOwner) {
      const all: Permissions = {};
      for (const k of PERMISSION_KEYS) {
        all[k] = true;
      }
      return all;
    }
    return member.permissions || {};
  }, [member.permissions, isOwner]);

  const initialDataScope = useMemo<DataScope>(() => {
    if (isOwner) return "all";
    return member.data_scope || "self";
  }, [member.data_scope, isOwner]);

  // 草稿状态
  const [draftPermissions, setDraftPermissions] = useState<Permissions>(initialPermissions);
  const [draftDataScope, setDraftDataScope] = useState<DataScope>(initialDataScope);

  // 当成员变更或 Props 更新时同步草稿
  useEffect(() => {
    setDraftPermissions(initialPermissions);
    setDraftDataScope(initialDataScope);
  }, [initialPermissions, initialDataScope]);

  // 判断是否有未保存改动
  const isDirty = useMemo(() => {
    if (isOwner) return false;
    const sameDataScope = draftDataScope === initialDataScope;
    const samePerms = PERMISSION_KEYS.every(
      (key) => (draftPermissions[key] === true) === (initialPermissions[key] === true)
    );
    return !sameDataScope || !samePerms;
  }, [draftPermissions, draftDataScope, initialPermissions, initialDataScope, isOwner]);

  // 复选框切换
  const handleTogglePermission = useCallback(
    (key: PermissionKey, checked: boolean) => {
      if (isOwner || !canEdit || isSaving) return;
      setDraftPermissions((prev) => ({
        ...prev,
        [key]: checked,
      }));
    },
    [isOwner, canEdit, isSaving]
  );

  // 类别全选/取消全选
  const handleToggleCategory = useCallback(
    (category: PermissionCategory) => {
      if (isOwner || !canEdit || isSaving) return;
      const keys = PERMISSION_CATEGORIES[category];
      const allChecked = keys.every((k) => draftPermissions[k] === true);

      setDraftPermissions((prev) => {
        const next = { ...prev };
        for (const k of keys) {
          next[k] = !allChecked;
        }
        return next;
      });
    },
    [draftPermissions, isOwner, canEdit, isSaving]
  );

  // 重置草稿
  const handleReset = useCallback(() => {
    setDraftPermissions(initialPermissions);
    setDraftDataScope(initialDataScope);
  }, [initialPermissions, initialDataScope]);

  // 保存变更
  const handleSave = useCallback(() => {
    if (!isDirty || isSaving || !canEdit || isOwner) return;
    void onSave(draftPermissions, draftDataScope);
  }, [isDirty, isSaving, canEdit, isOwner, draftPermissions, draftDataScope, onSave]);

  const categories = Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[];

  return (
    <div className="flex flex-col h-full bg-zinc-50/50">
      {/* 顶部标题与状态条 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 bg-white shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-zinc-100 flex items-center justify-center border border-zinc-200/60">
            <Shield className="size-4 text-zinc-700 stroke-[1.75]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-zinc-900 tracking-tight">成员权限配置</h3>
              {isDirty && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#D97757]/10 text-[#D97757] border border-[#D97757]/20 motion-safe:animate-pulse">
                  未保存更改
                </span>
              )}
              {isOwner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200/80">
                  创始人全选不可编辑
                </span>
              )}
            </div>
            <p className="text-[12px] text-zinc-500 mt-0.5">设置该成员的功能访问权限与数据查看范围</p>
          </div>
        </div>

        {isDirty && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="text-[12px] text-zinc-500 hover:text-zinc-800 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-100"
          >
            <RotateCcw className="size-3" />
            重置
          </button>
        )}
      </div>

      {/* 主体编辑区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 板块二：数据范围 (Data Scope) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[13px] font-semibold text-zinc-900 tracking-tight">数据范围</h4>
              <p className="text-[12px] text-zinc-500">决定该成员在数据分析看板与报表中可见的数据边界</p>
            </div>
          </div>

          {/* Segmented Control / Radio Group */}
          <div className="bg-zinc-100/90 p-1.5 rounded-2xl grid grid-cols-3 gap-1.5 border border-zinc-200/60 shadow-inner">
            {DATA_SCOPE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = draftDataScope === option.value;
              const isDisabled = isOwner || !canEdit || isSaving;

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && setDraftDataScope(option.value)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl text-center transition-all duration-150 relative",
                    isSelected
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200/80 font-medium"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-white/50",
                    isDisabled && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn("size-3.5", isSelected ? "text-[#5F82A8]" : "text-zinc-500")} />
                    <span className="text-[13px] font-medium">{option.label}</span>
                  </div>
                  <span className="text-[11px] text-zinc-500 mt-1 leading-tight">{option.sublabel}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 板块一：功能权限 (Functional Permissions) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-t border-zinc-200/80 pt-5">
            <div>
              <h4 className="text-[13px] font-semibold text-zinc-900 tracking-tight">功能权限</h4>
              <p className="text-[12px] text-zinc-500">按 4 大核心模块划分子权限，可灵活授予任何成员</p>
            </div>
          </div>

          <div className="space-y-4">
            {categories.map((category) => {
              const categoryLabel = PERMISSION_CATEGORY_LABELS[category];
              const keys = PERMISSION_CATEGORIES[category];
              const CategoryIcon = CATEGORY_ICONS[category];

              const enabledCount = keys.filter((k) => draftPermissions[k] === true).length;
              const allChecked = enabledCount === keys.length;
              const isDisabled = isOwner || !canEdit || isSaving;

              return (
                <div
                  key={category}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3 shadow-xs hover:border-zinc-300 transition-colors"
                >
                  {/* 类别标头 */}
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-lg bg-zinc-100 flex items-center justify-center border border-zinc-200/50">
                        <CategoryIcon className="size-3.5 text-[#5F82A8]" />
                      </div>
                      <span className="text-[13px] font-semibold text-zinc-900">{categoryLabel}</span>
                      <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                        {enabledCount} / {keys.length} 已开启
                      </span>
                    </div>

                    {!isDisabled && (
                      <button
                        type="button"
                        onClick={() => handleToggleCategory(category)}
                        className="text-[12px] font-medium text-[#5F82A8] hover:text-[#4A698B] transition-colors"
                      >
                        {allChecked ? "取消全选" : "全选本类"}
                      </button>
                    )}
                  </div>

                  {/* 该类别下的权限 Checkbox 列表 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {keys.map((key) => {
                      const isChecked = draftPermissions[key] === true;
                      const label = PERMISSION_LABELS[key];
                      const desc = PERMISSION_DESCRIPTIONS[key];
                      const checkboxId = `perm-cb-${member.id}-${key}`;

                      return (
                        <label
                          key={key}
                          htmlFor={checkboxId}
                          className={cn(
                            "flex items-start justify-between p-3 rounded-xl border transition-all duration-150 select-none",
                            isChecked
                              ? isOwner
                                ? "border-zinc-200 bg-zinc-100/70 text-zinc-700 cursor-not-allowed"
                                : "border-[#5F82A8]/40 bg-[#5F82A8]/5 shadow-2xs"
                              : "border-zinc-200 bg-white hover:bg-zinc-50/80 text-zinc-700",
                            isDisabled && !isOwner && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          <div className="space-y-0.5 pr-2">
                            <span className="text-[13px] font-medium text-zinc-900 block">{label}</span>
                            {desc && <p className="text-[11px] text-zinc-500 leading-snug">{desc}</p>}
                          </div>
                          <Checkbox
                            id={checkboxId}
                            checked={isChecked}
                            disabled={isDisabled}
                            onCheckedChange={(checked) => handleTogglePermission(key, checked === true)}
                            className="mt-0.5 shrink-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 底部保存 / 操作栏 */}
      <div className="flex items-center justify-between border-t border-zinc-200 bg-white p-4 px-6 shrink-0">
        <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
          <Info className="size-3.5 shrink-0" />
          <span>保存后权限与数据范围将立即生效</span>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isSaving}
              className="h-9 px-3.5 text-[12px] text-zinc-600 rounded-xl hover:bg-zinc-100"
            >
              取消
            </Button>
          )}

          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || !canEdit || isSaving || isOwner}
            className={cn(
              "h-9 px-5 rounded-xl text-[12px] font-medium transition-all shadow-xs",
              isDirty && !isSaving && !isOwner && canEdit
                ? "bg-[#D97757] hover:bg-[#C96442] text-white active:scale-95 cursor-pointer"
                : "bg-zinc-200 text-zinc-600 cursor-not-allowed shadow-none"
            )}
          >
            {isSaving ? "保存中..." : isDirty ? "保存变更" : "已是最新"}
          </Button>
        </div>
      </div>
    </div>
  );
}
