# DYData 项目记忆总览

## 项目基础
- 项目名：DYData，抖音数据日报平台
- 技术栈：Next.js App Router + Tailwind CSS + shadcn/ui + Supabase + Vercel
- 正式域名：`dydata.cc`
- 备用域名：`dydata.vercel.app`
- 部署平台：Vercel
- 部署方式：push `main` 自动部署

## 当前稳定规则
- 不要把部署方式改成 Cloudflare Workers
- `git user.email` 必须是 `1305085564@qq.com`
- git remote 应为 `git@github.com:1305085564-hue/dydata.git`
- 服务端接口用 `SUPABASE_SERVICE_ROLE_KEY`
- `cron` 接口兼容 `CRON_SECRET` 和 `REMIND_SECRET`
- 不改旧 migration，只能新增 migration
- 不改线上 `.env`
- 配置类改动前先读原文

## 当前项目状态
- migration `001-034` 已执行
- `035` 跳过
- 截图数据实际在 `video_metrics_snapshots`
- 不在 `content_asset`
- 后台重构前 3 批已完成
- 第 4、5 批目前搁置

## 当前重要待关注点
- `/admin/analytics` 仍有过 Application Error 记录，需要排查真实报错堆栈
- 管理后台“权限管理”显示异常时，先核对账号 role 是否真是 `owner`

## 使用建议
- 先读项目根目录 `AGENTS.md`
- 再读 `README.md`
- 再读 `docs/维护交接清单.md`
- 涉及数据和截图链路时，再读 `docs/数据口径.md`、`docs/截图上传维护手册.md`
## GitHub 连接记忆

- DYData 正式目标形态仍然是：fetch / push 都走 SSH，即 `git@github.com:1305085564-hue/dydata.git`
- 但这台 Win 电脑历史上能 push，并不代表 SSH 已经打通；那次实际依赖的是 HTTPS + 本机保存的 GitHub token
- 当前本机长期 SSH 配置已经写入：
  - `C:\Users\25417\.ssh\config`
  - `github.com -> ssh.github.com:443`
  - `IdentityFile C:\Users\25417\.ssh\id_ed25519`
  - `IdentitiesOnly yes`
- 当前 SSH 未彻底恢复的唯一原因：GitHub 账号尚未绑定 `C:\Users\25417\.ssh\id_ed25519.pub`
- 以后只要再次遇到“昨天能 push，今天突然不行”，先查协议和凭据，不要先怀疑仓库代码
