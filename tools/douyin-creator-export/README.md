# 抖音达人视频数据导出工具（隔离目录）

这个目录只放「抖音达人视频数据采集 / Excel 导出」相关工具，和 DYData 业务代码隔离。

## 当前稳定流程

1. 用 `npm run douyin:collect -- --url="https://www.douyin.com/user/..."` 打开独立 Chrome profile。
2. 第一次运行时在这个 profile 里手动登录抖音并安装「社媒助手」。
3. 在达人主页按 `Alt+C` 唤起「社媒助手」。
4. 点击「采集本页视频」。
5. 点击「自动滚动」，确认检测数等于达人作品数。
6. 点击「确认采集」。
7. 若插件没有直接导出 Excel，则用页面上已加载的作品卡片数据生成 Excel。

## 重要边界

- 不碰用户日常 Chrome Profile。
- 不再调用 `--remote-debugging-port=9222` 接管日常 Chrome。
- 不再自动重启或关闭 Chrome。
- 不把工具代码放进 `src/`，不参与 DYData 业务运行。

## 现有产物

本次已生成：

`/Users/mac/Projects/dydata/output/douyin-exports/小鳄鱼之道-抖音作品数据-60条.xlsx`

该文件包含 60 条作品卡片数据：视频 ID、标题、点赞数、话题标签、视频链接、达人主页、原始文本。

## 可用命令

- `npm run douyin:collect -- --url="https://www.douyin.com/user/..."`
- `npm run douyin:excel -- --input="tools/douyin-creator-export/examples/小鳄鱼之道-60条.json" --output="output/douyin-exports/抖音作品数据.xlsx"`
