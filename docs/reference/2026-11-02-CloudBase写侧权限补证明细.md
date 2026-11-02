# CloudBase 写侧权限补证明细

> 本页为93a2f8de时期的历史证据。原221个表操作及4个private辅助函数缺证，已由[最新B05定向补证](2026-11-02-CloudBaseB05写侧权限验收补齐.md)在9个角色/状态组合中补齐。本页当时的BLOCKED不追溯改绿；整包仍未通过。

日期：2026-11-02。实际候选：`93a2f8de`。仅上海隔离环境；旧 JWT 属于固定封禁合成账号。

**结论：部分补证完成，B05仍为 BLOCKED。** 下列“已拒绝”来自真实网关请求；“未授予”仅为权限目录事实，不能替代行为测试；没有安全夹具的操作继续BLOCKED。

实际目录：80张可写基表、42个受保护函数。写表请求拒绝17次；另221个表操作未覆盖；公开RPC拒绝38个，4个private辅助函数没有独立执行证据。

## 表操作逐项结果

| 基表 | 新增 | 修改 | 删除 |
|---|---|---|---|
| accounts | 已拒绝（HTTP 403，http-403） | 已拒绝（HTTP 200，RLS零行且原行不变） | BLOCKED：无安全删除夹具 |
| admin_actions | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| advice_actions | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_channels | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_feature_bindings | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_feature_config | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_feature_config_archives | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_feedback | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_input_bundle | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_insight_result | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_provider_key_models | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_provider_keys | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_providers | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| ai_result | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| audit_logs | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| content_asset | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| content_observations | BLOCKED：无安全新增夹具 | 已拒绝（HTTP 200，RLS零行且原行不变） | 已拒绝（HTTP 200，RLS零行且原行不变） |
| content_tag_link | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| daily_reports | BLOCKED：无安全新增夹具 | 已拒绝（HTTP 200，RLS零行且原行不变） | BLOCKED：无安全删除夹具 |
| exemption_audit | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| exemption_grant | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| exemption_request | 已拒绝（HTTP 403，http-403） | 已拒绝（HTTP 200，RLS零行且原行不变） | BLOCKED：无安全删除夹具 |
| exemption_request_date | BLOCKED：无安全新增夹具 | 已拒绝（HTTP 200，RLS零行且原行不变） | 已拒绝（HTTP 200，RLS零行且原行不变） |
| fulfillment_appeals | BLOCKED：无安全新增夹具 | 已拒绝（HTTP 200，RLS零行且原行不变） | BLOCKED：无安全删除夹具 |
| fulfillment_records | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| invite_codes | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| market_context_daily | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| member_change_log | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| metric_snapshot | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| notifications | 已拒绝（HTTP 403，http-403） | 已拒绝（HTTP 200，RLS零行且原行不变） | 已拒绝（HTTP 200，RLS零行且原行不变） |
| profiles | 未授予（未发请求） | 已拒绝（HTTP 200，RLS零行且原行不变） | BLOCKED：无安全删除夹具 |
| profiles_group | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| profiles_team | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| provisional_tag_text | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| publish_drafts | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| remind_logs | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_conversation_skills | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_conversations | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_document_paragraphs | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_document_revisions | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_documents | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_generation_runs | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_messages | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_model_routes | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_model_views | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_modes | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_skill_versions | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| rewrite_skills | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| sample_quality_issues | BLOCKED：无安全新增夹具 | 已拒绝（HTTP 200，RLS零行且原行不变） | 已拒绝（HTTP 200，RLS零行且原行不变） |
| script_document | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| script_purposes | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| script_usage_records | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| sop_checkpoint_submissions | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| sop_daily_status | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| system_issues | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| tag_definition | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| team_join_requests | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| teams | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| usage_events | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| video_content_segments | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| video_metrics_snapshots | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| video_review_tickets | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| video_screenshot_replacement_history | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| video_tags | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| videos | BLOCKED：无安全新增夹具 | 已拒绝（HTTP 200，RLS零行且原行不变） | BLOCKED：无安全删除夹具 |
| violation_case_reason_tags | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| violation_case_visual_tags | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| violation_cases | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| violation_events | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| violation_reason_tags | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| visual_tags | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| weekly_decisions | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| work_submissions | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | 未授予（未发请求） |
| yike_areas | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| yike_execution_slots | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| yike_item_events | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| yike_items | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| yike_people | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| yike_projects | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |
| yike_workspaces | BLOCKED：无安全新增夹具 | BLOCKED：无安全修改夹具 | BLOCKED：无安全删除夹具 |

80张基表目录完整，不代表80张表的全部操作通过。这里只使用已确认归属的合成行；没有为补数量请求历史行。可写视图和其他入口不由此基表目录覆盖。

## 受保护函数逐项结果

原42个函数 = 38个public函数 + 4个private辅助函数。private函数不伪装成公开RPC；不拿404或参数错误作为权限拒绝。

| 函数签名 | 结果 | 请求编号 / 边界 |
|---|---|---|
| `active_visible_user_ids(uuid)` | 已拒绝（HTTP 403） | `927c6bd2-29ec-44b0-8baf-79776686198f` |
| `active_visible_user_ids_v2(uuid,text)` | 已拒绝（HTTP 403） | `d759ecab-94cc-495a-9c0f-4ba52cc76720` |
| `apply_exemption_grant_atomically(uuid,date,date,text,text,text,boolean)` | 已拒绝（HTTP 403） | `188b7498-1b52-4dcb-851b-34ee836156fa` |
| `apply_exemption_grant_atomically_v2(uuid,date,date,text,text,text,boolean,text)` | 已拒绝（HTTP 403） | `53ea2e88-da6d-431e-bcd5-1f1087543314` |
| `private.can_read_team_actor(uuid)` | BLOCKED | private未向网关暴露；尚未单独隔离执行其间接路径 |
| `private.can_read_team_claim(uuid)` | BLOCKED | private未向网关暴露；尚未单独隔离执行其间接路径 |
| `private.can_read_team_topic(uuid)` | BLOCKED | private未向网关暴露；尚未单独隔离执行其间接路径 |
| `case_library_actor_scope(uuid)` | 已拒绝（HTTP 403） | `e8ee4115-60b7-407a-be08-54dd5e96b95d` |
| `case_library_inbox(uuid)` | 已拒绝（HTTP 403） | `80f9f90d-b334-4871-8147-cda7bf1ab79e` |
| `case_library_inbox_counts(uuid)` | 已拒绝（HTTP 403） | `06efbc21-58fd-4203-bf2b-e47b3cd69a9d` |
| `case_library_processed(uuid)` | 已拒绝（HTTP 403） | `479dd035-42d2-47ab-8cf7-ddcd9aa47446` |
| `clear_exemption_grant_atomically(uuid)` | 已拒绝（HTTP 403） | `21aef466-d4ce-41f7-9d89-91e3c2ae1a80` |
| `clear_exemption_grant_atomically_v2(uuid,text)` | 已拒绝（HTTP 403） | `905a585c-80ec-4388-b0ab-606b670e1f18` |
| `clear_permanent_exemption_owner_atomically(uuid,text)` | 已拒绝（HTTP 403） | `79b30c65-b564-4694-9949-2ad55de8a32f` |
| `company_role_for_user(uuid)` | 已拒绝（HTTP 403） | `02918a02-2852-4911-9e2f-93229f46b0d5` |
| `count_remind_logs_for_user(uuid,date,integer)` | 已拒绝（HTTP 403） | `d899763a-82ff-4ed9-b687-c0c224b23b06` |
| `exemption_target_in_active_scope(uuid,uuid,text)` | 已拒绝（HTTP 403） | `bcdb6e1b-f6b4-4f18-96b7-160e8ec6dfa2` |
| `get_data_scope()` | 已拒绝（HTTP 403） | `e792f54c-a806-426b-964e-fe3d1b956e8d` |
| `handle_fulfillment_appeal(uuid,text,uuid,text)` | 已拒绝（HTTP 403） | `f6fa2de5-50a7-48f2-9e64-f6e061968e40` |
| `has_group_owner_qualification(uuid)` | 已拒绝（HTTP 403） | `2805ce0f-aa22-4ddf-a9ec-4f93879b5970` |
| `has_permission(text)` | 已拒绝（HTTP 403） | `ce951093-708e-42de-8abe-d81750eb81cd` |
| `has_violation_permission()` | 已拒绝（HTTP 403） | `de293343-9ab4-4c26-b1e0-96e870b3390a` |
| `private.is_active_topic_member()` | BLOCKED | private未向网关暴露；尚未单独隔离执行其间接路径 |
| `is_admin()` | 已拒绝（HTTP 403） | `782a5110-a314-443e-a229-2064b3dfe4af` |
| `is_admin_or_owner()` | 已拒绝（HTTP 403） | `418c3dd8-fec0-44e7-ac5d-55cd7026772c` |
| `is_group_mode_active(text)` | 已拒绝（HTTP 403） | `e9637d8a-5c95-4e2e-a948-f2fdb60c2bec` |
| `is_owner()` | 已拒绝（HTTP 403） | `a105eade-8f95-46cf-b116-4d126d287083` |
| `manage_ai_feature_lifecycle(text,text,text)` | 已拒绝（HTTP 403） | `bd4a842e-89db-4a6f-8e2f-5ea978d9c675` |
| `owns_account(uuid)` | 已拒绝（HTTP 403） | `ef8ecf0d-f23e-4afc-bbb6-a43afa8c6fd1` |
| `publish_draft_actor_scope(uuid)` | 已拒绝（HTTP 403） | `c44eb180-59ac-4952-ae75-f48e01ac8ebd` |
| `publish_drafts_review_queue(uuid)` | 已拒绝（HTTP 403） | `641d4d5d-baec-426e-8eb7-253c48872520` |
| `re_review_exemption_request_atomically(uuid,text,text)` | 已拒绝（HTTP 403） | `0d87a3ec-b625-42ea-9404-2ead8be390ba` |
| `reassign_member_work_group(uuid,text,uuid)` | 已拒绝（HTTP 403） | `5aa25b02-4278-4e75-9544-29792540500d` |
| `reopen_exemption_request_atomically(uuid,text)` | 已拒绝（HTTP 403） | `51874044-b941-4fea-b1e4-8ec4c67eebb2` |
| `reopen_fulfillment_appeal_atomically(uuid,uuid)` | 已拒绝（HTTP 403） | `79a92fa3-87e5-4c05-a560-d59b55e7c6f0` |
| `review_exemption_request_atomically(uuid,text)` | 已拒绝（HTTP 403） | `978dd864-b096-43e3-8f37-24c3926fdc9d` |
| `review_exemption_request_atomically_v2(uuid,text,text)` | 已拒绝（HTTP 403） | `ff4cef82-e2cb-4fdd-8b06-478c036ad96c` |
| `review_exemption_request_dates_atomically(uuid,text,date[],text,text)` | 已拒绝（HTTP 403） | `40dfa0df-a50e-4509-b030-ca980b282fa4` |
| `review_team_join_request(uuid,text,text)` | 已拒绝（HTTP 403） | `0e363f6d-3b3b-49de-b760-152d1e8347cf` |
| `set_permanent_exemption_owner_atomically(uuid,text,text)` | 已拒绝（HTTP 403） | `bc13201d-6f2d-4903-942d-95711f2d087c` |
| `visible_user_ids(uuid)` | 已拒绝（HTTP 403） | `5007936a-f3ab-42e3-b014-94075efce803` |
| `visible_user_ids_v2(uuid,text)` | 已拒绝（HTTP 403） | `cc4d40ac-fa95-4369-977d-324a77cb7e6b` |

这里只证明封禁合成身份的上述请求被拒绝，不代替三种正常角色的全部业务正例、所有参数组合和全部状态组合。参数/传输错误均没有计入拒绝通过。逐请求完整收据保存在本轮私有证据目录的 `inactive-write-evidence.json`。
