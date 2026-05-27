import { BootstrapPayload } from './types';

export const mockBootstrapData: BootstrapPayload = {
  feature: {
    key: "rewrite",
    label: "AI 文案改写",
    enabled: true
  },
  defaults: {
    autoModeEnabled: true,
    modelViewId: "mv-gemini",
    modeId: "mode-baokuan",
    lengthPresetId: "len-short",
    workflowId: "wf-standard"
  },
  modelViews: [
    {
      id: "mv-gemini",
      key: "gemini-family",
      label: "强语感系列 (默认)",
      description: "适合情绪拉满的口语化表达",
      isDefault: true
    },
    {
      id: "mv-opus",
      key: "opus-family",
      label: "强逻辑系列",
      description: "适合结构化拆解和初步起稿",
      isDefault: false
    }
  ],
  modes: [
    {
      id: "mode-baokuan",
      key: "baokuan",
      name: "更像爆款",
      description: "冲突感强，制造情绪波动",
      isDefault: true
    },
    {
      id: "mode-shizhan",
      key: "shizhan",
      name: "淘股吧实战派",
      description: "干货多，用词黑话多",
      isDefault: false
    },
    {
      id: "mode-kouyu",
      key: "kouyu",
      name: "更口语",
      description: "像聊天一样娓娓道来",
      isDefault: false
    }
  ],
  lengthPresets: [
    {
      id: "len-short",
      key: "short",
      name: "精简 (适合口播)",
      description: "30-60秒可读完",
      isDefault: true
    },
    {
      id: "len-normal",
      key: "normal",
      name: "标准长度",
      description: "适合常规图文",
      isDefault: false
    },
    {
      id: "len-long",
      key: "long",
      name: "详细展开",
      description: "适合深度长文",
      isDefault: false
    }
  ],
  workflow: {
    id: "wf-standard",
    key: "auto-rewrite-v1",
    name: "标准改写链路",
    description: "先打框架，再做润色",
    steps: [
      {
        id: "step-1",
        key: "framework",
        name: "强逻辑起稿",
        description: null,
        sortOrder: 1,
        modelViewId: "mv-opus"
      },
      {
        id: "step-2",
        key: "polish",
        name: "强语感润色",
        description: null,
        sortOrder: 2,
        modelViewId: "mv-gemini"
      }
    ]
  }
};
