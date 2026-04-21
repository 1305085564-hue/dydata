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
