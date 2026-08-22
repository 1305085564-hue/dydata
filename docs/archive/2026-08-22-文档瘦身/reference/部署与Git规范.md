# 部署与 Git 规范

## 操作前检查

push / pull / fetch 前先确认：
- `git remote -v` → 确认 SSH remote
- `ssh -T git@github.com` → 确认 SSH 连通
- `git ls-remote origin` → 确认可访问

SSH 失败先修 SSH，不改 HTTPS 兜底。

## push 后验收

必须汇报：本次文件、提交号、验证结果，并核对云端 `main` 已是该提交。缺任一项不能称为已发布。
