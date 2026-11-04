# 2026-11-04 切回 Supabase 前增量核查（CX）

本轮状态：**本地已改（仅核查报告与日志）；未推送，未切换。线上仍为 CloudBase 上海 + Vercel 新加坡。**

## 结论与建议

- 实测：CloudBase 99 张 public 表从 63,190 行变为 63,370 行。新增 180 行，修改 3 行，删除 0 行。
- 新增全部是访问/性能日志；修改全部是 AI 测试时间。日报、作品、复盘、选题、截图关联、成员资料等业务行没有差异。
- 建议：正式无人写入窗口开始后再查一次增量；若届时仍相同，无须搬员工业务记录。180 条日志和 3 行 AI 时间记录可由阿禅确认后不搬，本轮没有丢弃任何数据。
- COS 新增 1 张未关联图片，保留原文件，不把它自行判作可丢测试数据。
- CloudBase 环境、文件、密钥和线上开关均未修改；没有执行增量搬运、推送或部署。

## 比较范围与时间

用户口述的切换时刻为 03:45；实际 `source/manifest.json` 的一致性快照时间是 **2026-11-04 03:27:37.564581（上海）**。本次以这份实际快照为基线，覆盖其后更大的时间段，不假称是精确的 03:45 快照。

CloudBase 逐行读取：10:05:39—10:07:16；10:11:31 又在一次只读查询中独立核对 99 表的行数及两组行内容摘要：94 表与快照一致，差异仍只落在下面 5 表，行数与逐行读取一致。自动计算列按原对账工具规则排除。账号、COS 与旧 Supabase 同轮补查至约 10:13。生产没有停止写入，结果代表本次读取时点，不代表将来切换窗口。

对比按主键进行；4 张未声明主键的表使用经检查无重复的 id。对时间、数字、JSON、数组按数据库类型统一表示后比较全部非自动计算字段，保留修改字段明细。原始数据、密码校验信息和对象路径仅保存在仓库外权限受限目录，不写入报告。

## 有变化的表与来源

| 表 | 新增 | 修改 | 删除 | 来源与建议 |
|---|---:|---:|---:|---|
| admin_first_screen_perf_events | 67 | 0 | 0 | 页面性能记录；60 条来自测试账号、7 条来自真实账号。可申请不搬，不涉及业务录入 |
| usage_events | 113 | 0 | 0 | 页面访问记录；92 条来自测试账号、21 条来自真实账号。可申请不搬 |
| ai_feature_bindings | 0 | 1 | 0 | 仅截图识别绑定 updated_at 变化，模型、渠道、提示词等配置未变；建议不搬时间 |
| ai_provider_key_models | 0 | 1 | 0 | 仅一个模型的 last_failure_at、last_success_at 变化；建议不搬探测时间 |
| ai_provider_keys | 0 | 1 | 0 | 仅 last_success_at 变化；建议不搬探测时间 |
| **合计** | **180** | **3** | **0** | **没有识别出必须迁回的员工业务记录** |

按来源：测试账号产生 152 条日志；真实账号产生 28 条日志（不是日报、选题或作品录入）。3 条 AI 时间记录属于测试/运行状态，不能把整行配置称作测试垃圾而删除。抖音同步来源增量为 0；员工真实业务录入差异为 0。

## 截图与账号

- COS 新加坡桶只读完整列举 4,207 个对象（5 页）；相对快照及 03:45 都只有 1 个新增/更新对象，时间为 **09:02:16**，属阿禅账号目录，JPEG，76,976 字节，未被任何已抓取 public 记录引用。签名 HEAD 200；随后真实 GET 200，完整读到 76,976 字节并核对 JPEG 文件头。它可能是测试或未提交上传，来源未确认，**保留，不删**。
- Supabase `storage.objects` 在快照后无新增或更新。新图实际在 COS，不在 Supabase Storage；迁回数据库不要求把这张文件复制到 Supabase。
- 代码支持 Supabase 数据库搭配 COS 截图存储（`src/lib/screenshot-storage.ts`）。切回必须沿用有效 COS 配置并确认以 COS 读取；本轮未切目标环境，不能把 COS 对象读取成功冒充为“Supabase 线上图片验收通过”。Vercel 将生产 COS/存储变量作为敏感值隐藏，本轮只确认变量存在，未获取其实际值。若 Supabase 主存储先签名成功却实际对象缺失，不能假设浏览器必然自动回退 COS。
- Supabase 原有 84 个业务账号在 CloudBase 中全数存在，UUID subject、邮箱及密码校验信息逐一对应，**密码变化 0、新建 0、删除 0**；旧 Supabase 当前 84 个账号的邮箱、密码校验信息也与快照相同。
- CloudBase 总计 88 个身份，另外 4 个是迁移前已有的额外身份、无业务 profiles，不是切换后新建用户。
- 两套登录凭据不同：仅有 CloudBase 登录态的人切回后需重新登录。仍保留有效 Supabase 登录态的浏览器可能无需重登；员工通知按“统一重新登录一次”准备，两个域名都要实际验收。

## 旧 Supabase 与抖音同步边界

旧 Supabase 的业务表和账号没有业务差异，但并非字面上完全零写入：相对 03:27 快照，usage_events 多 2 条页面访问记录，时间为 04:48:35、04:48:53。没有与 CloudBase 员工业务数据冲突的证据。

当前 CloudBase 的 99 表没有 douyin_*，Supabase 全库 pg_tables 只读查询同样返回空集。仓库虽有同步实现和迁移文件，但不能据此宣称线上已具备跑一次同步的条件。本次没有可用“重跑抖音”补齐的已识别差异；正式切换验收中的同步项需先明确线上可执行入口与数据库准备状态。

源码表明：同步可刷新部分当前指标并去重作品，但获取作品最多 4 页×10 件；真实历史 24h/72h 快照不能靠未来重跑保证无损复原。因此未来若窗口出现同步增量，不得一概丢弃等重跑。

## 验证与未覆盖

实际完成的只读命令（全部退出 0；凭据未输出）：

1. 私有 `read-cloudbase.mjs` + `compare.py`：403 次只读请求，99 表全字段比较；`verify-hashes.mjs` 独立一次只读全表摘要核对。
2. 私有 `check-supabase.mjs` / `supabase-differences.mjs`：只读事务核对 99 表、84 账号及 Storage 元数据。自动计算列造成的一处摘要差异经排除及逐行比较确认为无差异；访问日志实际多 2 条。
3. 私有 `check-files.py` / `check-file-get.py`：COS 列表、HEAD、GET；两域名真实 health 请求均 200、cloudbase/up，x-vercel-id 包含 ::sin1::。

读取脚本先后修正了一处 COPY 换行解析、一次 PostgreSQL SSL 参数语义及一次 COS 代理连接；修正后定向重跑成功。所有数据库请求使用 READ ONLY 事务，未运行任意业务写函数。未执行登录、抖音同步、AI 付费调用或新测速；这些是第二步切换后的验收，不借用旧结果标通过。

实测响应头（10:13）：

- dydata.cc：`sfo1::sin1::265sz-1793758394161-aad0e855883d`
- direct.dydata.cc：`sfo1::sin1::xdsfc-1793758395691-4b10bb6d1d90`

## 第二步失败时恢复 CloudBase（只附命令，本轮未执行）

以下供尚未向员工恢复写入的切换验收窗口使用：先用已存在的私有脚本恢复构建开关，再把域名提升回当前已验证的 CloudBase 部署，无须重建旧版本。

```sh
(
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
  python3 "$HOME/.local/share/dydata/review/2026-11-04-直接迁移/env-mutate.py" switch &&
  node "$HOME/.npm-global/lib/node_modules/vercel/dist/vc.js" promote dpl_J9xUfCLimXXeQW6ZyQpQUJ8iGaHM --scope 1305085564-1671s-projects
)
```

命令经静态核对但未执行；switch 根据既有私有环境记录恢复四个 CloudBase 变量，NEXT_PUBLIC_DYDATA_BACKEND 足以让当前代码选择 CloudBase，rollback-five 清除的 DYDATA_BACKEND 保持缺省。完成后仍需核对两个域名的实际部署和健康响应。若已允许 Supabase 新增业务写入，不能直接用旧 CloudBase 数据回退而忽略该段新数据。

## 99 表完整明细

下列新增/修改/删除均为 **CloudBase 相对原始 Supabase 快照**，不混入旧 Supabase 后来的两条访问日志。

| 表 | 快照行数 | CloudBase 行数 | 新增 | 修改 | 删除 |
|---|---:|---:|---:|---:|---:|
| accounts | 83 | 83 | 0 | 0 | 0 |
| admin_actions | 19 | 19 | 0 | 0 | 0 |
| admin_first_screen_perf_events | 20256 | 20323 | 67 | 0 | 0 |
| advice_actions | 0 | 0 | 0 | 0 | 0 |
| ai_channels | 8 | 8 | 0 | 0 | 0 |
| ai_feature_bindings | 10 | 10 | 0 | 1 | 0 |
| ai_feature_config | 7 | 7 | 0 | 0 | 0 |
| ai_feature_config_archives | 1 | 1 | 0 | 0 | 0 |
| ai_feedback | 0 | 0 | 0 | 0 | 0 |
| ai_input_bundle | 3 | 3 | 0 | 0 | 0 |
| ai_insight_result | 3 | 3 | 0 | 0 | 0 |
| ai_provider_key_models | 119 | 119 | 0 | 1 | 0 |
| ai_provider_keys | 10 | 10 | 0 | 1 | 0 |
| ai_provider_priority_migration_backup_20261009 | 5 | 5 | 0 | 0 | 0 |
| ai_providers | 6 | 6 | 0 | 0 | 0 |
| ai_result | 0 | 0 | 0 | 0 | 0 |
| appeal_backfill_20261019_ledger | 3 | 3 | 0 | 0 | 0 |
| audit_logs | 907 | 907 | 0 | 0 | 0 |
| content_asset | 0 | 0 | 0 | 0 | 0 |
| content_history | 0 | 0 | 0 | 0 | 0 |
| content_item | 4 | 4 | 0 | 0 | 0 |
| content_observations | 1 | 1 | 0 | 0 | 0 |
| content_tag_link | 0 | 0 | 0 | 0 | 0 |
| daily_reports | 2724 | 2724 | 0 | 0 | 0 |
| exemption_audit | 0 | 0 | 0 | 0 | 0 |
| exemption_grant | 539 | 539 | 0 | 0 | 0 |
| exemption_request | 731 | 731 | 0 | 0 | 0 |
| exemption_request_date | 1020 | 1020 | 0 | 0 | 0 |
| field_provenance | 0 | 0 | 0 | 0 | 0 |
| fulfillment_appeals | 251 | 251 | 0 | 0 | 0 |
| fulfillment_records | 38 | 38 | 0 | 0 | 0 |
| group_mode_sessions | 20 | 20 | 0 | 0 | 0 |
| group_permission_qualifications | 0 | 0 | 0 | 0 | 0 |
| invite_codes | 77 | 77 | 0 | 0 | 0 |
| market_context_daily | 1 | 1 | 0 | 0 | 0 |
| member_change_log | 35 | 35 | 0 | 0 | 0 |
| metric_snapshot | 0 | 0 | 0 | 0 | 0 |
| notifications | 2905 | 2905 | 0 | 0 | 0 |
| profiles | 84 | 84 | 0 | 0 | 0 |
| profiles_group | 0 | 0 | 0 | 0 | 0 |
| profiles_team | 0 | 0 | 0 | 0 | 0 |
| provisional_tag_text | 0 | 0 | 0 | 0 | 0 |
| publish_drafts | 30 | 30 | 0 | 0 | 0 |
| remind_logs | 427 | 427 | 0 | 0 | 0 |
| report_date_fix_20261019_ledger | 13 | 13 | 0 | 0 | 0 |
| rewrite_conversation_skills | 2 | 2 | 0 | 0 | 0 |
| rewrite_conversations | 145 | 145 | 0 | 0 | 0 |
| rewrite_document_paragraphs | 332 | 332 | 0 | 0 | 0 |
| rewrite_document_revisions | 41 | 41 | 0 | 0 | 0 |
| rewrite_documents | 43 | 43 | 0 | 0 | 0 |
| rewrite_generation_runs | 22 | 22 | 0 | 0 | 0 |
| rewrite_messages | 297 | 297 | 0 | 0 | 0 |
| rewrite_model_routes | 4 | 4 | 0 | 0 | 0 |
| rewrite_model_views | 4 | 4 | 0 | 0 | 0 |
| rewrite_modes | 3 | 3 | 0 | 0 | 0 |
| rewrite_skill_versions | 2 | 2 | 0 | 0 | 0 |
| rewrite_skills | 2 | 2 | 0 | 0 | 0 |
| sample_quality_issues | 0 | 0 | 0 | 0 | 0 |
| script_document | 0 | 0 | 0 | 0 | 0 |
| script_purposes | 2 | 2 | 0 | 0 | 0 |
| script_segment | 0 | 0 | 0 | 0 | 0 |
| script_usage_records | 53 | 53 | 0 | 0 | 0 |
| sop_checkpoint_submissions | 30 | 30 | 0 | 0 | 0 |
| sop_daily_status | 952 | 952 | 0 | 0 | 0 |
| sub_topic_claims | 41 | 41 | 0 | 0 | 0 |
| sub_topics | 91 | 91 | 0 | 0 | 0 |
| submission_batch | 0 | 0 | 0 | 0 | 0 |
| system_issues | 0 | 0 | 0 | 0 | 0 |
| system_settings | 2 | 2 | 0 | 0 | 0 |
| tag_definition | 0 | 0 | 0 | 0 | 0 |
| team_join_requests | 36 | 36 | 0 | 0 | 0 |
| teams | 9 | 9 | 0 | 0 | 0 |
| topic_groups | 40 | 40 | 0 | 0 | 0 |
| topic_import_batches | 0 | 0 | 0 | 0 | 0 |
| topics | 8 | 8 | 0 | 0 | 0 |
| usage_events | 16443 | 16556 | 113 | 0 | 0 |
| video_content_segments | 9 | 9 | 0 | 0 | 0 |
| video_metrics_snapshots | 2778 | 2778 | 0 | 0 | 0 |
| video_review_tickets | 0 | 0 | 0 | 0 | 0 |
| video_screenshot_replacement_history | 21 | 21 | 0 | 0 | 0 |
| video_tags | 8427 | 8427 | 0 | 0 | 0 |
| videos | 2812 | 2812 | 0 | 0 | 0 |
| violation_case_reason_tags | 1 | 1 | 0 | 0 | 0 |
| violation_case_visual_tags | 0 | 0 | 0 | 0 | 0 |
| violation_cases | 34 | 34 | 0 | 0 | 0 |
| violation_events | 3 | 3 | 0 | 0 | 0 |
| violation_reason_tags | 7 | 7 | 0 | 0 | 0 |
| visual_tags | 0 | 0 | 0 | 0 | 0 |
| weekly_decisions | 0 | 0 | 0 | 0 | 0 |
| work_groups | 6 | 6 | 0 | 0 | 0 |
| work_submissions | 1 | 1 | 0 | 0 | 0 |
| writer_certifications | 11 | 11 | 0 | 0 | 0 |
| yike_areas | 5 | 5 | 0 | 0 | 0 |
| yike_execution_slots | 1 | 1 | 0 | 0 | 0 |
| yike_item_events | 106 | 106 | 0 | 0 | 0 |
| yike_items | 20 | 20 | 0 | 0 | 0 |
| yike_people | 1 | 1 | 0 | 0 | 0 |
| yike_projects | 2 | 2 | 0 | 0 | 0 |
| yike_workspaces | 1 | 1 | 0 | 0 | 0 |
| **合计** | **63190** | **63370** | **180** | **3** | **0** |
