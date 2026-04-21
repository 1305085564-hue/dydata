# DYData 待修复问题

## 1. 数据分析页 Application Error
- 页面：`/admin/analytics`
- 现象：线上出现 server-side exception
- 先查顺序：
1. 确认 `videos`、`video_metrics_snapshots`、`video_tags` 表是否存在
2. 如果表不存在，先补执行相关 migration
3. 如果表存在，去看 Vercel Functions 的真实报错
4. 再确认环境变量里是否有 `SUPABASE_SERVICE_ROLE_KEY`

## 2. 管理后台权限管理不显示
- 现象：admin 账号可能看不到“权限管理”
- 常见根因：账号 role 实际不是 `owner`
- 先查用户 role，再判断是不是前端显示问题

## 处理原则
- 先确认线上部署成功没有
- 先区分代码问题还是数据库问题
- 先看真实报错，不要盲改代码
