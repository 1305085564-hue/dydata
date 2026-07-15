'use client';

import React, { useState } from 'react';
import { X, Sparkles, Plus, Trash2, Edit2, SlidersHorizontal, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BootstrapPayload } from '../types';
import type { Skill } from './SkillCabin';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bootstrap: BootstrapPayload | null;
  availableSkills: Skill[];
  contextLimit: number;
  onUpdateContextLimit: (limit: number) => void;
  onRefreshSkills: () => void;
}

export function SettingsDrawer({
  isOpen,
  onClose,
  bootstrap,
  availableSkills,
  contextLimit,
  onUpdateContextLimit,
  onRefreshSkills,
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'skills' | 'params'>('skills');

  // 技能创建/编辑临时状态
  const [editingSkill, setEditingSkill] = useState<Partial<Skill> | null>(null);
  const [skillName, setSkillName] = useState('');
  const [skillPrompt, setSkillPrompt] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillModel, setSkillModel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 过滤出个人可以修改的技能（scope === 'private' 或公开但是属于当前用户的）
  // 简便起见，只展示和编辑 scope === 'private' 的个人专属技能
  const privateSkills = availableSkills.filter((s) => s.scope === 'private');

  const startCreate = () => {
    setEditingSkill({});
    setSkillName('');
    setSkillPrompt('');
    setSkillDesc('');
    setSkillModel('');
  };

  const startEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setSkillName(skill.name);
    setSkillPrompt(skill.systemPrompt);
    setSkillDesc(skill.description || '');
    setSkillModel(skill.defaultModelViewId || '');
  };

  const handleSaveSkill = async () => {
    if (!skillName.trim() || !skillPrompt.trim()) return;
    setIsSubmitting(true);

    try {
      const isEdit = Boolean(editingSkill?.id);
      const url = isEdit ? `/api/rewrite/skills/${editingSkill!.id}` : '/api/rewrite/skills';
      const method = isEdit ? 'PATCH' : 'POST';

      // 技能 key 需要是唯一的英文字符。如果是创建，自动生成一个随机 key
      const key = isEdit ? undefined : `skill_${Date.now()}`;

      const body = {
        name: skillName.trim(),
        systemPrompt: skillPrompt.trim(),
        description: skillDesc.trim() || null,
        defaultModelViewId: skillModel || null,
        scope: 'private',
        key,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditingSkill(null);
        onRefreshSkills();
      } else {
        const errorData = await res.json();
        alert(errorData.error || '保存技能失败');
      }
    } catch (e) {
      console.warn('保存技能异常', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!confirm('确定要删除这个个人技能吗？')) return;
    try {
      const res = await fetch(`/api/rewrite/skills/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefreshSkills();
      } else {
        alert('删除失败');
      }
    } catch (e) {
      console.warn('删除技能异常', e);
    }
  };

  return (
    <div
      className={cn(
        'absolute inset-0 bg-white z-40 transition-all duration-300 flex flex-col',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* 头部控制 */}
      <div className="shrink-0 h-[48px] px-4 border-b border-stone-200/50 flex items-center justify-between bg-stone-50/50">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500 tracking-wider">
          <SlidersHorizontal className="h-4 w-4" />
          <span>创意配置台</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-stone-100 text-stone-500 hover:text-stone-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs 切换 */}
      <div className="shrink-0 flex border-b border-stone-200/40 px-2 pt-1.5 bg-stone-50/20">
        <button
          onClick={() => { setActiveTab('skills'); setEditingSkill(null); }}
          className={cn(
            'px-4 py-1.5 text-[12px] font-medium border-b-2 transition-all',
            activeTab === 'skills'
              ? 'border-stone-900 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          )}
        >
          个人技能管理
        </button>
        <button
          onClick={() => { setActiveTab('params'); setEditingSkill(null); }}
          className={cn(
            'px-4 py-1.5 text-[12px] font-medium border-b-2 transition-all',
            activeTab === 'params'
              ? 'border-stone-900 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          )}
        >
          参数配置
        </button>
      </div>

      {/* 内容流式渲染区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'skills' ? (
          editingSkill ? (
            /* 1. 创建/编辑技能表单 */
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="text-[12px] font-medium uppercase tracking-wider text-stone-500">
                {editingSkill.id ? '编辑个人技能' : '新建个人技能'}
              </div>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-stone-700 pl-0.5">技能名称 (必填)</span>
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="w-full bg-stone-100/50 border border-transparent focus:bg-white focus:border-stone-200 rounded-lg p-2 text-[12px] outline-none focus:ring-1 focus:ring-stone-900/10"
                  placeholder="如：小红书爆款润色"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-stone-700 pl-0.5">提示词指令 System Prompt (必填)</span>
                <textarea
                  value={skillPrompt}
                  onChange={(e) => setSkillPrompt(e.target.value)}
                  rows={6}
                  className="w-full bg-stone-100/50 border border-transparent focus:bg-white focus:border-stone-200 rounded-lg p-2.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-stone-900/10"
                  placeholder="输入此技能对文案的具体改写指令要求..."
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-stone-700 pl-0.5">技能简短说明</span>
                <input
                  type="text"
                  value={skillDesc}
                  onChange={(e) => setSkillDesc(e.target.value)}
                  className="w-full bg-stone-100/50 border border-transparent focus:bg-white focus:border-stone-200 rounded-lg p-2 text-[12px] outline-none focus:ring-1 focus:ring-stone-900/10"
                  placeholder="简述使用场景或作用"
                />
              </label>

              {/* 绑定默认模型 */}
              {bootstrap && (
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-stone-700 pl-0.5">绑定默认模型 (可选)</span>
                  <select
                    value={skillModel}
                    onChange={(e) => setSkillModel(e.target.value)}
                    className="w-full bg-stone-100/50 border border-transparent focus:bg-white focus:border-stone-200 rounded-lg p-2 text-[12px] outline-none focus:ring-1 focus:ring-stone-900/10"
                  >
                    <option value="">跟随全局配置</option>
                    {bootstrap.modelViews.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* 表单按钮 */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditingSkill(null)}
                  className="flex-1 border border-stone-200 hover:bg-stone-50 font-medium py-2 rounded-lg text-[12px] transition-all active:scale-[0.98]"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveSkill}
                  disabled={isSubmitting || !skillName.trim() || !skillPrompt.trim()}
                  className="flex-1 bg-[#D97757] text-white hover:bg-[#C96442] disabled:opacity-50 font-medium py-2 rounded-lg text-[12px] shadow-sm shadow-[#D97757]/20 transition-all active:scale-[0.98]"
                >
                  {isSubmitting ? '保存中...' : '确认保存'}
                </button>
              </div>
            </div>
          ) : (
            /* 2. 个人技能管理列表 */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium uppercase tracking-wider text-stone-500">自建个人技能</span>
                <button
                  onClick={startCreate}
                  className="inline-flex items-center gap-1 bg-[#D97757]/10 hover:bg-[#D97757]/20 border border-[#D97757]/25 text-[#C96442] px-2 py-0.5 rounded-lg text-[12px] font-medium transition-all active:scale-[0.98]"
                >
                  <Plus className="h-3 w-3" />
                  <span>添加技能</span>
                </button>
              </div>

              {privateSkills.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-stone-200 rounded-lg space-y-2">
                  <BookOpen className="h-6 w-6 text-stone-500 mx-auto" />
                  <p className="text-[12px] text-stone-500 font-medium">暂无个人技能，点击上方按钮创建</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {privateSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className="group flex items-center justify-between rounded-lg border border-stone-200/50 bg-white p-2.5 transition-all hover:border-stone-300"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                          <span className="text-[12px] font-medium text-stone-900 truncate">{skill.name}</span>
                        </div>
                        {skill.description && (
                          <p className="text-[12px] text-stone-500 line-clamp-1 mt-0.5 leading-relaxed">{skill.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 ml-3 shrink-0">
                        <button
                          onClick={() => startEdit(skill)}
                          className="p-1 hover:bg-stone-100 rounded-lg text-stone-500 hover:text-stone-700"
                          title="编辑技能"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSkill(skill.id)}
                          className="p-1 hover:bg-stone-100 rounded-lg text-stone-500 hover:text-rose-600"
                          title="删除技能"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          /* 3. 参数配置（上下文剪枝限制） */
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="text-[12px] font-medium uppercase tracking-wider text-stone-500">上下文管理</div>

            <div className="border border-stone-200/50 bg-white p-4 rounded-lg space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-stone-900">携带历史对话轮数</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-700">
                  {contextLimit === 99 ? '携带全量' : `携带最近 ${contextLimit} 轮`}
                </span>
              </div>

              <div className="space-y-1.5">
                <input
                  aria-label="历史对话携带轮数限制"
                  type="range"
                  min="2"
                  max="12"
                  step="2"
                  value={contextLimit === 99 ? 12 : contextLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateContextLimit(val === 12 ? 99 : val);
                  }}
                  className="w-full accent-stone-800 h-1.5 bg-stone-200 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[12px] font-medium text-stone-500 tabular-nums">
                  <span>2轮</span>
                  <span>4轮</span>
                  <span>6轮</span>
                  <span>8轮</span>
                  <span>10轮</span>
                  <span>全量</span>
                </div>
              </div>
              <p className="text-[12px] text-stone-500 leading-relaxed leading-normal mt-1">
                限制携带轮数能极大降低长对话的 token 消耗成本，并能有效减少 AI 受到远期老指令的幻觉干扰。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
