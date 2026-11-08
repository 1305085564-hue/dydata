# CloudBase 临时环境真跑报告（E项：开通阻塞）

2026-11-02，[CX]。开工提交 `9069c72c`，分支 `codex/cloudbase-migration-20261101`。**BLOCKED：真实平台接管、回退尚未开始，不是验收通过报告。**

## 1. 授权与范围

按序读取[脚本与演练证据](2026-11-02-CloudBase切换脚本与演练证据.md)、[切换执行手册](切换执行手册.md)、[总报告 §7](2026-11-02-CloudBase切换就绪总报告.md)。完整最终快照接管口径保持。

阿禅先选分支1，核实收费方式后进一步选择“尝试第二个免费体验环境”。**没有授权购买第二个收费个人版环境，也未选择分支2。** 上海现有个人版月费不需要再次开通；第二个临时环境是独立资源。此前推荐“按量临时环境”未先核实购买入口，本轮纠正：当前公开新建入口要求套餐，“超限按量”指套餐用尽后的计费。

禁区遵守：未连接生产Supabase，未查询或修改上海业务/Auth数据，未改Vercel、密钥、COS或部署，未push，未覆盖 `review/2026-11-02-切换就绪/` 旧文件。只查询账号级套餐、报价、资格与环境列表，其他会话未提交改动保留。应用、正式脚本、手册、总报告、03看板未改。

## 2. 平台真实请求

沿用既有 `@cloudbase/cloudbase-mcp@2.36.2`，入口 `/Users/mac/.npm/_npx/88d9f76c32260533/node_modules/@cloudbase/cloudbase-mcp/dist/index.cjs`；`getCloudBaseManager({cloudBaseOptions:{region:'ap-shanghai'}})`。未改桌面配置或安装工具。正式driver固定上海的保护未改，未用它执行写入。

| 动作 | 实测结果 | 请求/文件 |
|---|---|---|
| 新购套餐列表，只读 | 未发现可直接创建的纯按量套餐 | `650baf57-4ee7-41ae-8309-8a7285a5d36f` |
| 个人版1个月上海询价，只读 | 优惠价19.90元、原价39.90元；未下单 | `price-baas_personal.json` |
| 体验版询价，创建前再次核价 | `RealTotalCost=0`、`Currency=CNY`；报价不等于资格 | `price-baas_trial.json`、`free-create-preflight.json` |
| 北京时间21:24:36，一次CreateEnv | **失败，573ms，无EnvId** | `47863a44-7573-43d3-9a94-38de76a8e32a` |
| 21:25:13，DescribeEnvs | 环境总数1，本次别名/ID前缀匹配0 | `24417f2a-5df9-412b-9e9d-d0a820e69427` |
| DescribeEnvLimit，只读，代理执行后主代理读原响应 | `MaxFreeTrialNum=0/CurrentFreeTrialNum=0`；另有 `MaxFreeEnvNum=1/CurrentFreeEnvNum=0`，两字段不能混为一谈 | `d0ed124d-f963-474e-9060-0017ef86b32c` |
| DescribeUserPromotionalActivity，只读 | NewUser/ReturningUser/BaasFree，`Activities=[]` | `d47ac2a8-109e-4db8-a3ea-24e36f5468e6` |
| 主代理独立再次DescribeEnvs + DescribeEnvLimit | 本次环境匹配仍0，体验版上限仍0/已用0 | 列表 `855d814e-f606-4efe-a2a3-018abea76f9f`；资格 `a6ce0425-0ec4-4151-982c-7e87d9e4bb46` |

创建参数：`Alias=dydata-e-1102`、`PackageId=baas_trial`、`Resources=['postgresql']`、`Period=1`、`AutoVoucher=false`、`RenewFlag=NOTIFY_AND_MANUAL_RENEW`、`EnableOverrun=FALSE`。只请求数据库，关闭自动续费与超额按量；未自动重试、换付费套餐或绕过检查。官方CreateEnv允许非空资源数组含postgresql，未要求同时带storage/function。

平台错误为 `InvalidParameter`，原文：

> [CreateEnv] CreateDealError: 状态检查失败，请检查环境状态是否正常，包括但不限于：环境未创建，环境未初始化完成，资源创建或者变更中，超出操作次数限制

**实测**：免费请求失败，随后未查到本次环境；当前体验版上限为0、促销资格为空，未找到本账号可用的免费开通路径。**错误根因未唯一确认**：多原因提示和资格读数不能证明后端是哪条检查导致拒绝，不直接断言“已用完免费名额”。SDK另有活动创建入口，但无可用活动，且其创建参数未提供PG资源选择；未调用该入口试探或绕过资格。

没有EnvId，因此没有可删除的临时环境，也没有“删除成功”凭据；查询无匹配不能冒充成功删除。未查费用中心最终订单，不能仅凭失败退出码宣称最终账单为0。

## 3. 实测与本地演练对照

| 步骤 | 历史本地证据 | 本轮真实平台 |
|---|---|---|
| 107批暂存 | 最大489,996字节 | **NOT RUN**；往返耗时未知。runBatches每批先查账本，不能把全程说成仅107个请求 |
| 一次事务接管 | 404,226字节、4092ms；较新串联412,795字节 | **NOT RUN**；60秒余量未知，不用本地4秒推断 |
| 99表/179外键重建 | 本地通过 | **NOT RUN**；真实平台权限未获新证据 |
| 84身份镜像 | 本地合成身份59正常/24封禁/1未激活 | **NOT RUN** |
| 独立对账及序列 | 历史本地通过 | **NOT RUN** |
| 新写入后回退 | 手册规定双边停写、保全、审定差异；无现成无损自动反向同步 | **NOT RUN**；不能声称无损自动回退通过 |
| 临时环境删除及读回 | 不适用 | 创建未成功，删除未执行 |

本轮全新目录重跑本地恢复：100/100表对账一致（含1回归夹具表），原SQL排行榜553条；随后仅在本轮新建本机来源库去掉夹具，确认99张原业务表，构造84个合成身份输入（59/24/1）。未导入真实员工密码，不把本地通过当平台真跑。收尾停止本轮本机PostgreSQL，保留私有归档和失败材料。

## 4. 时间预算与中止判据

**30分钟公告是否成立：尚无法判断。** 没有平台暂存、接管、读回及带新写入处置耗时，不能填写有实测依据的预算；没有擅自执行分支2的30–120分钟公告调整。

沿用手册已有硬边界：单请求/语句60秒、锁等待3秒、心跳超过45秒即停、执行包截止早于守锁结束至少120秒；结果不明先查账本和实际状态，不盲重试；接管事务不能拆开绕过超时。这些是现有约束，**不是本轮性能证据**。

后续需实测来源持锁/导出、目标读取/包生成、107批写入及全部附加读请求、接管、序列、独立对账、分级回退。环境准备安排在窗口外；本轮禁止部署，维护和目标部署仍须单独预算。单个临时环境样本不代表生产p95。

有新写入后不能因超时直接切回旧源，必须停写、保全并核对差异。现有工具不提供已实测的无损反向同步。“超X秒即放弃”的值须以实测恢复耗时和批准窗口余额确定；目前不编造数值，也不把“时间风险”扩大为“绝无数据风险”。

## 5. 验证、留档与继续条件

私有证据：`/Users/mac/.local/share/dydata/review/2026-11-02-临时环境真跑-1793625578605/`，目录700、私有文件600；SQL/Auth/业务归档不进Git。失败创建脚本和原响应保留，不直接重跑同名收据。

| 命令 | 退出/覆盖 |
|---|---|
| `/usr/local/bin/node --test scripts/cloudbase/cutover*.test.mjs` | Node24.13.1，退出0；18项/18通过/0失败/0跳过，`baseline-tests.log` |
| `node scripts/cloudbase/cutover-rehearse.mjs --source-archive <既有归档> --private-functions <既有辅助函数> --output-dir <本轮新目录>/local-source` | Node26.13.0，退出0；本地恢复、增改删、重复、权限保留；不是云端 |
| `/usr/local/bin/node <本轮目录>/prepare-local-source.mjs` | Node24.13.1，退出0；本机99表/84合成身份准备 |
| `/usr/local/bin/node <本轮目录>/create-free-env.mjs` | Node24.13.1，退出1；真实平台拒绝；排他收据保护 |
| `manager.env.listEnvs()`、`DescribeUserPromotionalActivity` | Node24.13.1，退出0；无本次环境/无促销资格 |
| `pg_ctl -D <本轮目录>/local-source/pgdata stop -m fast -w` | 退出0，server stopped；保留卷和归档 |

未复跑全仓、应用构建、完整角色或浏览器门禁；没有应用改动。只完成环境入口核验、免费开通尝试和新本地输入准备，**E项真实首跑仍BLOCKED**。

继续同一目标需阿禅提供其一：授权第二个收费临时环境（下单前仍复核价格）；解除免费开通条件/提供独立可写临时环境；或明确改选分支2。拿到条件后立即接续真跑、带新写入处置、对账、删除读回和实测预算，不退回理论审计。本报告与日志本地提交，尚未push。

## 6. 官方依据

- [CreateEnv](https://cloud.tencent.com/document/product/876/128592)：购买/月周期、自动付款、postgresql资源、手动续费及超限按量参数。
- [配额管理](https://docs.cloudbase.net/solutions/cloudbase-for-platforms/quota)：套餐超额后按量计费。
- [套餐退费边界](https://cloud.tencent.com/document/product/876/136006)、[DestroyEnv](https://cloud.tencent.com/document/api/876/42149)：删除请求不等于最终物理删除或账单为0，不承诺全额退款。
