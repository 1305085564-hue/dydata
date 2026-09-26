# 一句话 Prompt（粘贴到 Claude Code，模型选 opus-5-5）

```
按 video-intro/STORYBOARD.md 和 video-intro/site-info.md，用 Canvas 2D 写 video-intro/scenes/ 下 5 个场景 painter（scene0..scene4.js，每个 export {durationMs, draw(ctx,W,H,t)}，t是场景内秒数，纯函数），接好 video-intro/player.html 的 window.renderAt(timeSec)，然后用 video-intro/render.mjs 在本机 Chromium 逐帧截图 + FFmpeg 合成 video-intro/out/dydata-intro-45s.mp4（1920x1080 30fps）。全假数据，品牌色锁死，不准联网拉资源。跑通后告诉我成片路径和帧数。
```
