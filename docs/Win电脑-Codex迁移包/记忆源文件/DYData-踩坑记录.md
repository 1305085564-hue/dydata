# DYData 踩坑记录

- Vercel 部署失败时，先查 `git author email` 是否为 `1305085564@qq.com`
- `cron Unauthorized` 时，先查代码是不是只认了 `REMIND_SECRET`
- `cron` 查不到数据时，先查服务端是不是误用了 anon key，导致受 RLS 限制
- 后台导航或管理入口异常时，先查 select 是否查了未执行 migration 的列
- migration 报错时，先查是否跳号执行，依赖关系是否断裂
- analytics 查询报错时，先确认真实表结构和关系是否存在，不要只盯代码
- 线上报错但本地代码看起来没问题时，先确认数据库表和字段是否真的存在
- OCR / 模型问题先确认实际可用模型，不要先怀疑前端展示

## 一句话经验
- 先确认线上版本
- 再确认数据库结构
- 最后再改代码
## GitHub 连接补充记录（2026-04-21）

- 这台 Win 电脑之前“能 push”时，实际跑通的是 HTTPS remote + Windows 凭据管理器里的 GitHub token，不是纯 SSH。
- 本次 `fatal: unable to access 'https://github.com/...': Recv failure: Connection was reset` 的根因是 HTTPS 推送链路异常，不是仓库代码问题。
- 本机 SSH 网络本身是通的，`github.com:22` 和 `ssh.github.com:443` 都能握手。
- 当前纯 SSH 真正卡点是：GitHub 账号还没有接受本机 `C:\Users\25417\.ssh\id_ed25519` 这把 key，所以会报 `Permission denied (publickey)`。
- 以后排查顺序固定为：
  1. `git remote -v`
  2. `git config user.email`
  3. `ssh -T git@github.com`
  4. 再决定是协议问题、凭据问题，还是 SSH key 未绑定
- 如需恢复纯 SSH：
  - 把 `C:\Users\25417\.ssh\id_ed25519.pub` 绑定到 GitHub 账号 `1305085564-hue`
  - 然后确认 fetch / push 都是 `git@github.com:1305085564-hue/dydata.git`
