# video-intro · DYData 介绍片工作区（与网站业务代码隔离）

## 烟测（验证本机链路）
```bash
node video-intro/render.mjs --seconds 2 --fps 10 --out video-intro/out/smoke.mp4
```
成功会打印 `done -> ... (20 frames)`，用播放器打开 smoke.mp4 即可。

## 一句话正式跑（模型切 opus-5-5 后粘贴）
见 `prompt-one-shot.md`，跑完输出 `video-intro/out/dydata-intro-45s.mp4`（1350帧）。

## 约束
- `scenes/` 只用 Canvas 2D + 纯函数，不联网
- 本目录不进 Next 构建，不影响网站发布
