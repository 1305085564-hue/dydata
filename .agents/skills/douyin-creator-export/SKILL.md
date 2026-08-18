---
name: "douyin-creator-export"
description: "抖音达人视频数据采集与 Excel 表格导出。优先使用 Codex Chrome 直连能力操作用户已登录的本地 Chrome 和社媒助手；禁止启动隔离浏览器或重启日常 Chrome。"
---

# 抖音达人视频数据采集 Skill

当用户提供抖音达人主页链接，并要求采集/导出视频数据表格时使用。

## 必守边界

- 只使用用户已经登录好的本地 Chrome。
- 禁止启动新的 Chrome Profile。
- 禁止运行 `--remote-debugging-port=9222`。
- 禁止关闭、重启、杀掉用户 Chrome。
- 不下载视频原文件；用户只要 Excel 数据表。
- 工具代码只放在 `tools/douyin-creator-export/`，不要放进 `src/`。

## 标准流程

1. 使用 Codex Chrome 直连能力连接本地 Chrome。
2. 找到或打开用户给的抖音达人主页。
3. 按 `Alt+C` 唤起「社媒助手」页面注入按钮。
4. 点击「采集本页视频」。
5. 在弹窗里点击「自动滚动」，等待检测数等于达人作品总数。
6. 点击「确认采集」。
7. 如果插件直接下载 Excel，保存并验证行数。
8. 如果插件没有下载 Excel，用已加载的作品卡片数据兜底生成 Excel。

## 兜底 Excel 字段

- 序号
- 达人
- 视频ID
- 标题
- 点赞数
- 话题标签
- 视频链接
- 达人主页
- 原始文本

## 已知限制

兜底表只基于达人页作品卡片可见数据生成，不包含评论数、收藏数、转发数、发布时间等详情页字段。若必须要这些字段，需要社媒助手插件自身导出成功，或逐条打开详情页补采。

## 后处理命令

如果已经有 JSON 数据，可用隔离工具生成 Excel：

```bash
npm run douyin:excel -- --input="tools/douyin-creator-export/examples/小鳄鱼之道-60条.json" --output="output/douyin-exports/抖音作品数据.xlsx"
```
