# 认证与外键迁移方案比较

日期：2026-11-01。结论：保留业务UUID与历史profiles作为稳定业务身份，优先验证官方是否可保留登录subject；无法保留时使用受控映射。**不修改auth托管表、不重置密码、不在本轮实施任何方案。**

## 1. 三种“用户ID”必须分清

| 身份 | 受审报告证据 | 能得出的结论 | 不能得出的结论 |
|---|---|---|---|
| CloudBase内部行ID | 隔离报告§3.8：auth.users.id为bigint | 该实例不同于旧文档varchar描述；原uuid外键不能照搬到这个bigint键 | 所有业务UUID都必须改成bigint |
| 登录主体subject | 同报告另有sub varchar；官方文档称auth.uid读取JWT sub | JWT subject是待核对的身份入口，不等于内部行号 | 看到sub列就能任意写入原UUID，或写列会改变已签发token |
| 业务身份 | 当前public.profiles.id为UUID，历史业务记录依赖它 | 可保留业务主键，避免大量历史引用重编码 | 可以用profiles.id自引用来代替原profiles→auth根关系 |

auth.uid读取的是**请求中已签名JWT的sub**，不是每次自动查询auth.users.sub。官方说明提供了机制依据；本轮没有CloudBase网关真实令牌证据，尚不能给该实例的端到端行为盖章。[官方身份说明](https://docs.cloudbase.net/authentication-v2/auth/auth-pg)

## 2. 候选方案比较

| 方案 | 身份设计 | 外键/历史关系 | 前提与代价 | 评审建议 |
|---|---|---|---|---|
| A 官方建号保留原UUID subject | 内部id仍bigint；受支持建号接口使token.sub等于原UUID | 业务UUID保持；业务子表关联profiles；profiles另记录身份关联或受支持的外部身份键 | 必须证明自定义uid实际映射到sub且能真实登录；仍需处理auth.uid为text的比较 | 优先验证，未证明可用，不把写sub列当建号方案 |
| B CloudBase分配subject，映射到原profiles.id | 平台subject与业务UUID分离；由可信身份映射表/字段连接 | 保留业务UUID与全部历史profiles；新增身份映射唯一性约束 | RLS/helper及应用用户上下文用同一可信解析入口；不得覆盖平台auth.uid | A不成立时推荐评估；代价集中，避免重写全部业务ID |
| C 全部业务改为平台ID类型 | 业务主键/归属字段统一重编码到text或bigint | 所有外键、接口、历史截图路径和审计关联需同步处理 | 影响面大，恢复与跨系统关联更复杂；bigint内部ID生命周期还未知 | 不推荐作为本项目默认方案 |
| D 官方支持的UUID等价桥接键 | 平台认可的关系键/唯一约束连接profiles | 可保留身份关系的数据库约束 | 必须确认sub唯一性是全局还是project内，权限/生命周期及约束可建；不能在托管auth表擅加列 | 待官方答复的补充，不假设可建 |

A/B与密码迁移是两个独立问题。存在password列，不能证明哈希可导入、旧密码可登录或平台允许直接写。当前决定仍是等腾讯云书面答复。不能自行保存旧密码哈希、换算法、重置或删除账号。

推荐B的最小原则：可信平台subject→不可变业务UUID；映射按环境/签发者作用域唯一，并防止一个身份误绑两个人。员工不能写映射。多登录方式是否对应一个业务人物另定，不从姓名或邮箱模糊匹配。未映射/冲突/归档身份拒绝，而不是回退为全公司。NULL与非UUID subject不得无条件强转；解析失败应有明确拒绝结果，不能让大量策略随机报错。

历史profiles与可登录账号分开：原有归档人物仍是历史记录的合法父项，即使没有新平台登录账号也要保留。旧计划“只建61个活跃账号”不能据此删除其余profiles或历史引用。

## 3. 当前不是12条，而是14条外键

本轮实测：2026-11-01 01:38生产目录只读查询，public中引用auth.users(id)共14条，均已验证、不可延迟。旧报告写12条；不能判定是旧统计遗漏还是快照差异，但后续必须用新清单。

随后对下列13个业务子关系执行只读计数，确认非NULL归属在当前profiles中均有父项。只返回计数，不导出人员或业务行。profiles自身的根关系不参与这种自连接验证。

| 子表/字段 | 当前约束名 | 非NULL子记录 | 缺少profiles父项 | 目标处置候选 |
|---|---|---:|---:|---|
| profiles.id | profiles_id_fkey | 不适用 | 不适用 | 单独重建身份关系；不能自指profiles充数 |
| exemption_request.applicant_user_id | exemption_request_applicant_user_id_fkey | 680 | 0 | 若保留表，引用profiles.id |
| exemption_grant.user_id | exemption_grant_user_id_fkey | 505 | 0 | 同上 |
| team_join_requests.applicant_user_id | team_join_requests_applicant_user_id_fkey | 36 | 0 | 同上，并核对申请/转组边界 |
| fulfillment_records.user_id | fulfillment_records_user_id_fkey | 38 | 0 | 若保留表，引用profiles.id |
| fulfillment_records.marked_by | fulfillment_records_marked_by_fkey | 38 | 0 | 保留历史操作人关系 |
| usage_events.user_id | usage_events_user_id_fkey | 15990 | 0 | 若保留或归档，保留人物关系 |
| yike_areas.user_id | yike_areas_user_id_fkey | 5 | 0 | 随历史表保留/归档决策处理 |
| yike_workspaces.user_id | yike_workspaces_user_id_fkey | 1 | 0 | 同上 |
| yike_projects.user_id | yike_projects_user_id_fkey | 2 | 0 | 同上 |
| yike_people.user_id | yike_people_user_id_fkey | 1 | 0 | 同上 |
| yike_item_events.user_id | yike_item_events_user_id_fkey | 106 | 0 | 同上 |
| yike_items.user_id | yike_items_user_id_fkey | 20 | 0 | 同上 |
| yike_execution_slots.user_id | yike_execution_slots_user_id_fkey | 1 | 0 | 同上 |

这些计数证明“改指profiles”有当前数据基础，**不证明目标约束已经创建或迁移已通过**。再次迁移时仍需相同快照的孤儿、重复、NULL和映射对账。只迁部分子表时，实际需要改造的数量小于全库14条，不能把14直接当目标条数。

profiles→平台身份的可选关系：受支持时用独立bigint平台ID关联auth.users.id；或用subject映射并保留业务父项。选择前需核对目标auth表的唯一约束、project作用域、REFERENCES权限和平台删除/重建行为。不能把uuid列直接强转bigint，也不能靠FK表达式cast引用varchar列。[PostgreSQL外键约束](https://www.postgresql.org/docs/17/ddl-constraints.html)

**删除语义必须重新评审。** 原外键里profiles、入团、usage与yike关系带ON DELETE CASCADE；换父表以后，删除profiles的影响与原来删除auth.users不同，不能机械复制CASCADE。优先沿用归档保留历史的产品规则，禁止通过删人物连带抹掉业务历史；受控物理删除若有正式需求，另行设计与验收。

## 4. 用真实令牌验证auth.uid的方案（未执行）

下一轮获得隔离环境测试授权后：

1. 由平台支持的登录/建号流程准备两个测试用户A/B，不使用员工账号。保存两个不同subject及其业务UUID的受控对照，只把相等/不等布尔和测试标签写入报告。
2. 两个独立登录上下文获取真实access token。令牌留在进程内，不放命令参数、源码、截图、日志或报告。解码payload只作检查，不等于验签；由目标网关验证签名、过期、issuer/audience和环境。
3. 下一轮若获准创建最小诊断对象，用public下SECURITY INVOKER、无参数、仅authenticated可执行的诊断RPC，投影auth.uid、JWT sub相等性及current_user是否authenticated。不得使用SECURITY DEFINER或传入“模拟用户ID”来证明身份。
4. 用 `POST /v1/rdb/rest/rpc/<诊断函数>`，请求头 `Authorization: Bearer <A或B真实access_token>`。预期A/B各自uid非NULL、等于对应签发sub且互不相同；current_user均authenticated。Publishable Key/服务密钥不能替代用户令牌。[网关认证方式](https://docs.cloudbase.net/database/postgresql/initialization)
5. 经受控只读目录比对真实登录的subject与auth.users.sub映射，输出“匹配/不匹配”；不读取password。若测试A自定义旧UUID，则另验token.sub确等于指定UUID、业务解析结果等于profiles.id。仅“字符串长36位”不够。
6. 再做RLS的本人正向与他人反向，刷新令牌后重复；无令牌/无效/过期/错误环境/篡改token应拒绝。新旧subject或映射冲突应明确失败。

当前只能确认：官方机制描述读JWT sub，V管理角色探针返回NULL，与没有claims相符；**没有两名真实登录用户的网关验证记录**。读取函数定义和手工set_config只能补充SQL单元证据，不能取代网关验签与身份注入证据。

## 5. 放行条件

身份契约、两个真实token、业务UUID映射、13个子关系/身份根关系处置、归档历史、密码官方方案分别验收后，才可批准对应实施。当前只提出比较与验证设计，所有目标建号、探针、迁移和写测试均未运行。
