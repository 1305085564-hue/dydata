# CloudBase切换脚本与演练证据

2026-11-02，[CX]。冻结范围：排行榜兼容、维护开关、密钥/限流评估、切换脚本和本地演练。03看板不动。本轮**没有连接生产Supabase，没有执行CloudBase管理SQL写入，没有改Vercel、密钥、员工属性或COS对象，没有部署/push**。真实页面登录使用既有两测试账号，会产生正常Auth登录活动。浏览器另有14次自动usage-events请求，真实路由会尝试插入usage_events；是否实际落了14行未独立读回，未清理/回写。因此本轮浏览器不是纯只读，不能宣称上海全库零变化。截图授权14次及状态查询2次POST是读取/签票据，不修改历史作品或账号属性。原smoke收据“login/signout only”不完整，保留原件并由browser-write-boundary.json更正。真实排行榜读取和本地恢复分别报告。

## 1. 版本、运行及证据位置

开工HEAD `0b680ffc51fceab6db138683ff40667041ab31d8`，本轮改动以本地交付提交为准。Node24.13.1，PostgreSQL客户端18.3/本地服务16.15。私有材料根目录：`/Users/mac/.local/share/dydata/review/2026-11-02-切换就绪/`（700/600，不进Git）；每个命令用退出码收据和日志SHA核验，空tsc/lint日志不独自作为通过证据。运行脚本/原始响应和失败材料保留，临时测试密码副本在收尾删除。

## 2. 排行榜真实非空与对账

实测根因：旧RPC要求 `auth.uid()` 非空，上海服务API key没有该身份；直接换成服务端调用仍返回空。改由服务端复用既有可见范围，分页读取原RPC涉及日报/作品/账号/档案，保留18字段、发布日期/填报日期双入口、void过滤、排序及最终过滤，不改数据库、统计定义或Supabase旧RPC路径。

同表存在两个作品外键，初次查询因关系歧义返回300；改为显式原 `daily_reports_video_id_fkey` 后通过，失败不删除。独立审查发现时区字符串直接排序可能改变顺序，已按UTC微秒规范排序；测试覆盖偏移与同秒微秒。两查询每批500、每条路径最多40批，超限明确失败，不默默截断。

| 身份 | 真实接口 | 旧快照原SQL对照（自2026-10-03） | 结论 |
|---|---|---|---|
| 管理员 | 200 / 553条 | 同一身份规范可见范围57人；553条、18字段多重集合完全一致 | 非空通过 |
| 员工 | 200 / 553条 | 同一身份规范可见范围57人；553条、18字段多重集合完全一致 | 非空通过 |

原SQL对照来自本机恢复的旧业务快照，不是本轮生产连接。两角色结果恰好相同有实际对账支持，不代表所有角色范围永久相同；完全相同排序键的SQL行不承诺稳定次序。证据：`leaderboard-role-reconciliation.json`、两角色私有响应及 `independent-rehearsal-2/leaderboard-since-2026-10-03-private.json`。Supabase批次B仍暂缓。

真实浏览器两角色各3页导航及3刷新：管理员复盘/大盘/成员管理均可用；员工复盘可用，大盘/成员管理显示权限提示（HTTP200不当成授权成功）。两次退出200后身份401；登录1182/844ms；共549请求，Supabase/外部请求0，页面异常0。管理员三页networkidle 2581/10271/3340ms，员工1709/1452/1736ms；一个样本、缓存未受控，**不是首屏3秒或生产p95证据**。`smoke.json`含硬断言和原始请求。既有adapter的在途请求取消不完全，本次没有扩展修改；超时仍明确报错。

## 3. 停写与回退演练

新增既有middleware前置维护开关：`DYDATA_WRITE_FREEZE=1`，动态页面/API/Server Actions一并503，精确健康路由除外。关闭时保留原路由行为。实际本地生产HTTP九场景：8个503且维护标记1，健康200；未把前端禁用按钮当停写。`freeze-http.json`。

`cutover-freeze.mjs`离线生成PUBLIC/anon/authenticated/service_role的表、列、序列、函数临时停权包及绑定预计态的恢复包。本地298个对象：未到窗/过窗拒绝、窗内正向通过；员工读写、service/anon函数负例拒绝，原角色列更新/函数正例可用；恢复后原四角色权限与grant option精确相等，业务数据摘要不变。该证明不覆盖所有其他角色/grantor。`freeze-proof.json`及原失败证据保留。

独立守锁进程保持99表+Auth共100个SHARE锁，31秒后心跳前进，数据库owner对业务表/Auth写入亦锁超时，SELECT可用；SIGTERM后释放。最新完整串联再以带lockId、acquiredAt、来源身份的版本持锁并导出。HELD收据仍有最多45秒检测空窗，手册要求独立数据库读回，不能视为跨库原子锁。`lock-keeper-proof.json`、最新 `chain-lock-*.json`。

## 4. 备份与完整同步演练

来源旧归档：11-01北京时间02:10:48，99表/61,301行，10,154,646字节，SHA256 `bb797db9d9459e09dab5618ceab1f971021f1a1b21b4df54f4adbcc441819692`。原Auth侧车晚8–9小时，**不能拼成同一时点全备**，本轮新增一致导出器。

主代理独立重复了一轮完整“旧快照导出→本地导入→增/改/删→同步→对账”：100/100表行数与两摘要一致（99业务表+1自建回归表），总61,303行含2夹具；差异新增2/移除2，重复执行为already-current，目标策略/授权标记不变。不是100张原业务表。原代理和主代理结果分开留档，主代理 `independent-rehearsal-2/local-rehearsal-summary.json`；首次本地socket路径过长失败留在 `independent-rehearsal/`，已改TCP-only重新通过。

为避免把“本地TRUNCATE+复制模式”冒充CloudBase能力，新增独立云端包：持久私有暂存，最后一次事务接管，保留目标已修函数/RLS/ACL，按目标原外键定义重建；不依赖跨请求会话、临时表或时间戳增量。实际本地模拟CloudBase bigint/sub结构：99表/61,301行、179条FK；107暂存批，最大489,996字节；原子接管404,226字节、本地4092ms。故障注入证明业务/Auth一起回滚，原FK/触发器/函数/RLS/ACL指纹保留；重复批次跳过且验证账本。84**合成**身份镜像59正常/24封禁/1未激活、原额外3身份保留，不是重写上海员工。序列独立只进不退，实际执行后读回、重复跳过；setval不支持事务回滚，未混入“整事务可回滚”的承诺。`cloudbase-package-proof.json`。

最新导出→目标读取→包生成串联：99原业务表/61,301行，84合成Auth；来源100锁持续持有，246次本地只读查询，99/99目标和来源摘要一致，107暂存批，最终412,795字节。Auth时区统一UTC、保留微秒后精确对比，未删除保护字段。源文件篡改拒绝、换锁拒绝；离线测试补充过窗/失锁/换DB/回退余额不足拒绝。收据注明LOCAL，不冒充腾讯RequestId。

一致整库备份：10,083,332字节，SHA256 `3c82dfbbf1d533239ff32fd0133a5d16508e62dc0e7df23869c371ad818359cf`；public归档SHA256 `57a5137ba671417ba0a4109bca393881f6a114f189793361eef1bd423aac1658`；执行包SHA256 `5fa1ca4dfe6086fdc6e3fa5d853bc052f245e3953780afde3d0cce72e2c11336`。本地Auth是合成结构，**真实来源完整Auth/Storage备份权限与灾备恢复尚待窗口实证**。完整归档不恢复到CloudBase托管schema。源dump和所有Auth行仅保存在私有目录。`prepare-chain-proof.json`及`consistent-source-*/manifest.json`。

## 5. 99表逐表对账

以下是最新本地串联的实际行数，目标/来源双摘要均匹配；生成列由目标原定义重新计算，沿用既有1.2对账算法。完整摘要值和读查询编号在 `chain-capture.private.json`；不是11-02生产最新对账。

| 表 | 来源行数 | 目标行数 | 行数+双摘要 |
|---|---:|---:|---|
| `accounts` | 83 | 83 | 一致 |
| `admin_actions` | 19 | 19 | 一致 |
| `admin_first_screen_perf_events` | 19939 | 19939 | 一致 |
| `advice_actions` | 0 | 0 | 一致 |
| `ai_channels` | 8 | 8 | 一致 |
| `ai_feature_bindings` | 10 | 10 | 一致 |
| `ai_feature_config` | 7 | 7 | 一致 |
| `ai_feature_config_archives` | 1 | 1 | 一致 |
| `ai_feedback` | 0 | 0 | 一致 |
| `ai_input_bundle` | 3 | 3 | 一致 |
| `ai_insight_result` | 3 | 3 | 一致 |
| `ai_provider_key_models` | 119 | 119 | 一致 |
| `ai_provider_keys` | 10 | 10 | 一致 |
| `ai_provider_priority_migration_backup_20261009` | 5 | 5 | 一致 |
| `ai_providers` | 6 | 6 | 一致 |
| `ai_result` | 0 | 0 | 一致 |
| `appeal_backfill_20261019_ledger` | 3 | 3 | 一致 |
| `audit_logs` | 774 | 774 | 一致 |
| `content_asset` | 0 | 0 | 一致 |
| `content_history` | 0 | 0 | 一致 |
| `content_item` | 4 | 4 | 一致 |
| `content_observations` | 1 | 1 | 一致 |
| `content_tag_link` | 0 | 0 | 一致 |
| `daily_reports` | 2615 | 2615 | 一致 |
| `exemption_audit` | 0 | 0 | 一致 |
| `exemption_grant` | 505 | 505 | 一致 |
| `exemption_request` | 680 | 680 | 一致 |
| `exemption_request_date` | 972 | 972 | 一致 |
| `field_provenance` | 0 | 0 | 一致 |
| `fulfillment_appeals` | 216 | 216 | 一致 |
| `fulfillment_records` | 38 | 38 | 一致 |
| `group_mode_sessions` | 20 | 20 | 一致 |
| `group_permission_qualifications` | 0 | 0 | 一致 |
| `invite_codes` | 77 | 77 | 一致 |
| `market_context_daily` | 1 | 1 | 一致 |
| `member_change_log` | 35 | 35 | 一致 |
| `metric_snapshot` | 0 | 0 | 一致 |
| `notifications` | 2648 | 2648 | 一致 |
| `profiles` | 84 | 84 | 一致 |
| `profiles_group` | 0 | 0 | 一致 |
| `profiles_team` | 0 | 0 | 一致 |
| `provisional_tag_text` | 0 | 0 | 一致 |
| `publish_drafts` | 30 | 30 | 一致 |
| `remind_logs` | 427 | 427 | 一致 |
| `report_date_fix_20261019_ledger` | 13 | 13 | 一致 |
| `rewrite_conversation_skills` | 2 | 2 | 一致 |
| `rewrite_conversations` | 145 | 145 | 一致 |
| `rewrite_document_paragraphs` | 332 | 332 | 一致 |
| `rewrite_document_revisions` | 41 | 41 | 一致 |
| `rewrite_documents` | 43 | 43 | 一致 |
| `rewrite_generation_runs` | 22 | 22 | 一致 |
| `rewrite_messages` | 297 | 297 | 一致 |
| `rewrite_model_routes` | 4 | 4 | 一致 |
| `rewrite_model_views` | 4 | 4 | 一致 |
| `rewrite_modes` | 3 | 3 | 一致 |
| `rewrite_skill_versions` | 2 | 2 | 一致 |
| `rewrite_skills` | 2 | 2 | 一致 |
| `sample_quality_issues` | 0 | 0 | 一致 |
| `script_document` | 0 | 0 | 一致 |
| `script_purposes` | 2 | 2 | 一致 |
| `script_segment` | 0 | 0 | 一致 |
| `script_usage_records` | 53 | 53 | 一致 |
| `sop_checkpoint_submissions` | 30 | 30 | 一致 |
| `sop_daily_status` | 952 | 952 | 一致 |
| `sub_topic_claims` | 41 | 41 | 一致 |
| `sub_topics` | 82 | 82 | 一致 |
| `submission_batch` | 0 | 0 | 一致 |
| `system_issues` | 0 | 0 | 一致 |
| `system_settings` | 2 | 2 | 一致 |
| `tag_definition` | 0 | 0 | 一致 |
| `team_join_requests` | 36 | 36 | 一致 |
| `teams` | 9 | 9 | 一致 |
| `topic_groups` | 40 | 40 | 一致 |
| `topic_import_batches` | 0 | 0 | 一致 |
| `topics` | 8 | 8 | 一致 |
| `usage_events` | 15990 | 15990 | 一致 |
| `video_content_segments` | 9 | 9 | 一致 |
| `video_metrics_snapshots` | 2669 | 2669 | 一致 |
| `video_review_tickets` | 0 | 0 | 一致 |
| `video_screenshot_replacement_history` | 15 | 15 | 一致 |
| `video_tags` | 8209 | 8209 | 一致 |
| `videos` | 2703 | 2703 | 一致 |
| `violation_case_reason_tags` | 1 | 1 | 一致 |
| `violation_case_visual_tags` | 0 | 0 | 一致 |
| `violation_cases` | 34 | 34 | 一致 |
| `violation_events` | 3 | 3 | 一致 |
| `violation_reason_tags` | 7 | 7 | 一致 |
| `visual_tags` | 0 | 0 | 一致 |
| `weekly_decisions` | 0 | 0 | 一致 |
| `work_groups` | 6 | 6 | 一致 |
| `work_submissions` | 1 | 1 | 一致 |
| `writer_certifications` | 10 | 10 | 一致 |
| `yike_areas` | 5 | 5 | 一致 |
| `yike_execution_slots` | 1 | 1 | 一致 |
| `yike_item_events` | 106 | 106 | 一致 |
| `yike_items` | 20 | 20 | 一致 |
| `yike_people` | 1 | 1 | 一致 |
| `yike_projects` | 2 | 2 | 一致 |
| `yike_workspaces` | 1 | 1 | 一致 |

## 6. 验证命令与结论边界

- Node24：`npm test`等价脚本（tsx测试src两种扩展、maintainability、storage boundary）2562项/2554通过/0失败/8原有跳过；CloudBase脚本108/108，无跳过；`tsc --noEmit`退出0；改动应用文件定向ESLint退出0。命令、版本、退出码和输出SHA在 `quality-receipts.json`。
- 本地新家变量 `next build` 退出0，`build-receipt.json`；真实浏览器冒烟见第2节。没有执行生产浏览器门禁；34项完整角色门禁属于历史报告，未伪装本轮复跑。
- SQL故障注入、错误密码/员工状态篡改等历史失败未删断言；本轮新增负例覆盖相同行数不同内容、源文件校验、窗口/持锁/来源不匹配及接管中途失败。不用清理计数替代身份保护断言。

**已完成/已测**：应用兼容、维护开关、离线包和本地恢复/接管/回退、真实两角色非空；**尚未完成**：实际最终备份/同步/生产部署；**风险**：平台写权限和60秒执行上限、内存限流进程隔离、服务密钥临期、源保留不能恢复目标新写入；**待授权**：密钥方案、切换窗口与具体执行包。仍不把此包称为“生产切换已验收”。
