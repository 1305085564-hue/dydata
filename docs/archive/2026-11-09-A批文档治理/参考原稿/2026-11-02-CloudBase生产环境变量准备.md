# CloudBase 生产环境变量准备（3.3，未切换）

2026-11-02，[CX]。评审草案；以主工作区03看板最新口径及本轮授权为准。现上海 `dydata-d6g0gd1v37fcddf21` 直接作为将来生产数据库，套餐由负责人确认已升级个人版；本轮不新建环境、不改套餐、不写Vercel配置、不部署、不push、不改03看板。

## 一、准备结果与适用范围

已整理 **5项新增变量 + 现有38项生产变量保留关系**，准备本地25项业务配置和只含5项新增值的私有切换包。网页冒烟及构建读数见下节。**配置准备不等于已授权切换，也不能单凭HTTP200宣称全部业务正确。**

网站生产项目为 `dydata` / `prj_A2aAvvNiAFbrNwhum54b9teaXXVP`，团队 `team_6exzaoT1pAE5V7CYhiW3miM9`。只读Vercel接口核对Node版本为24.x；本地采用v24.13.1，应用基线 `4b48857218d6adfede3661b73175493444b885ba`。本轮未修改网站代码。

Vercel插件的环境变量读取返回403（requestId `iad1:sfo1:iad1:sfo1::d5cp4-1793618732962-fcb8d7d74362`），改用既有CLI独立凭据执行相同项目的GET，退出0：全环境51项，其中Production38项。只保存键名、目标、类型、ID，不保存线上变量值。首次CLI误用旧团队slug报scope不存在，后续以真实teamId核对成功，不记为权限通过。

## 二、需要新增的5项

| 键名 | 准备值或取值来源 | 原Supabase对应项 | 生效与保密边界 |
|---|---|---|---|
| DYDATA_BACKEND | `cloudbase` | 当前未配置时默认Supabase | 服务端开关 |
| NEXT_PUBLIC_DYDATA_BACKEND | `cloudbase` | 同上 | 浏览器构建开关；必须与服务端一致，重新构建 |
| CLOUDBASE_ENV_ID | `dydata-d6g0gd1v37fcddf21` | NEXT_PUBLIC_SUPABASE_URL的目标项目用途 | 服务端环境定位，不是PG连接串 |
| NEXT_PUBLIC_CLOUDBASE_ENV_ID | 同一上海环境ID | NEXT_PUBLIC_SUPABASE_URL的浏览器定位用途 | 可公开；前端通过本站代理访问 |
| CLOUDBASE_SERVICE_API_KEY | 同环境当前已有效的service_role API Key，私有留档；不得复制普通用户JWT或CLI临时管理凭据 | SUPABASE_SERVICE_ROLE_KEY | 仅服务端；禁止NEXT_PUBLIC前缀，不能写入报告或Git |

**有效期风险（实测）**：11-01旧留档密钥只读请求返回401/`ACCESS_TOKEN_EXPIRED`（`ca8f9220-d887-492c-9f12-41aa6b72d50a`）；11-02既有门禁配置中的密钥返回200、1行（`2fadfa09-1811-4b22-9c05-86009d5533c9`）。后者令牌声明到期为 **2026-11-07 02:40:34北京时间**（剩余约4.3天），只证明当前可用。切换前必须由负责人确认可持续使用的服务密钥来源和到期维护安排；本轮没有创建、延长、轮换或改动任何密钥，不能把短期验证密钥当永久生产凭据。

## 三、现有变量：保留原值，不用本地文件覆盖线上

| 用途 | 完整键名 | 本轮准备方式与来源 |
|---|---|---|
| COS与截图授权（8） | COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION、COS_APP_ID、SCREENSHOT_STORAGE、SCREENSHOT_GRANT_SECRET、SCREENSHOT_GRANT_ENABLED | 沿用现Production配置；本地使用主工作区已有对应值，COS_REGION=ap-singapore、SCREENSHOT_STORAGE=cos。私有桶和路径不迁、不改；授权签名密钥不新生成 |
| 飞书（5） | FEISHU_WEBHOOK_URL、FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_APP_ENCRYPT_KEY、FEISHU_APP_VERIFICATION_TOKEN | 沿用Production；本地备妥已有值，不触发投递 |
| 定时任务（2） | CRON_SECRET、REMIND_SECRET | 沿用Production；不调用cron，不更改定时计划 |
| AI（3） | AI_BASE_URL、AI_API_KEY、AI_MODEL | 沿用Production；不验证真实外发，功能正例观察期补测 |
| OCR（3） | BAIDU_OCR_API_KEY、BAIDU_OCR_SECRET_KEY、OCR_MODEL | 保留Production；本地仅前两项有既有值，OCR_MODEL未注入，未测试OCR功能 |
| 监控（1） | NEXT_PUBLIC_SENTRY_DSN | 保留Production；本地本轮不注入Sentry，避免遥测外发。未测试告警送达 |
| Supabase旧配置（9） | SUPABASE_JWT_SECRET、SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、SUPABASE_ANON_KEY、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、NEXT_PUBLIC_SUPABASE_ANON_KEY、NEXT_PUBLIC_SUPABASE_URL | 保留用于回退，本轮不删、不改、不复用为CloudBase密钥。本地进程明确移除这些变量 |
| PostgreSQL旧配置（7） | POSTGRES_URL、POSTGRES_PRISMA_URL、POSTGRES_URL_NON_POOLING、POSTGRES_USER、POSTGRES_HOST、POSTGRES_PASSWORD、POSTGRES_DATABASE | 保留原值；不作为CloudBase运行配置，本地移除；以后清理另行批准 |

以上共38项。没有逐项解密比对本地与线上秘密值；实际切换包只新增5项，保留原有38项，避免覆盖未知配置。**25项本地文件不能整包覆盖Vercel生产变量。**

## 四、可选项、旧模板及缺项

- `COS_READ_TIMEOUT_MS`：当前Production无此键，代码默认3000ms；本轮不建议顺带改变超时。
- `UPSTASH_REDIS_REST_URL/TOKEN`：当前Production和本地都缺失，现有代码会降级单实例内存限流；**不具备跨Vercel实例的可靠限流**，本轮不新购Redis，作为存量风险评审。
- `CLOUDBASE_SECRET_ID/SECRET_KEY/SESSION_TOKEN`：旧`.env.example`仍要求管理凭据，但当前归档/恢复已改由既有service API Key调用受限PG函数。真实调用链在`src/lib/supabase/admin.ts`、`src/lib/cloudbase/management.ts`；不需要把过期CLI/STS管理凭据带入生产。模板未在本任务改动。
- `SUPABASE_DB_URL/ACCESS_TOKEN`只用于来源备份/迁移工具，不是新家网站必需变量，不上传。
- `SENTRY_ORG/PROJECT/AUTH_TOKEN/RELEASE`等构建/观测配置当前未在Production键清单中；不在本轮新配。Vercel自动系统变量由平台提供，不复制本地`VERCEL_*`。
- 域名保持`dydata.cc`，无需为了迁移新增`NEXT_PUBLIC_SITE_URL/NEXT_PUBLIC_APP_URL/APP_BASE_URL`。`APP_BASE_URL`的后台续提交流程存在localhost默认回退，当前无线上配置；该低频调用未在本轮冒烟覆盖，需切换前专项核对，不能因四页通过推定可用。
- 抖音变量与缺失表继续推迟；不要添加空值制造“已配置”。

## 五、本地实测

本轮使用全新Next生产构建、独立端口3293、真实Chromium及已有组长/组员测试账号原密码；只登录、读取、刷新、退出，不创建夹具、不修改业务行或身份属性。登录会自然更新平台活动时间，页面可能记录既有性能事件；本轮不清理这些真实访问记录。

| 本轮命令/场景 | 实际结果 |
|---|---|
| `node <私有根>/run.cjs build` | 应用Node v24.13.1，`next build`退出0；全新CloudBase配置构建，保留middleware弃用告警 |
| `node <私有根>/run.cjs types` | 独立`tsc --noEmit --pretty false`退出0；构建不代替类型检查 |
| `node <私有根>/smoke.cjs` | 真实Chromium，两已有身份；6次页面导航+6次刷新，基础冒烟退出0；断言未跳过；脚本/结果SHA绑定`smoke-receipt.json` |
| 管理员原密码登录 | 738ms；复盘/大盘/成员管理均200且无权限拒绝；导航到networkidle分别2558/11334/2564ms |
| 普通员工原密码登录 | 697ms；复盘可读，大盘/成员管理显示权限提示（HTTP200是提示页面，未判为管理权限开放）；1426/1363/1461ms |
| 真实数据读取 | 两身份复盘列表接口各200/1作品；管理员返回36个profile、46个账号选项，普通员工55个profile，沿用作品复盘跨员工只读特例；未据此证明全部数据范围正确 |
| 会话与退出 | 各角色页面刷新仍登录；同浏览器退出200，随后身份接口401；不证明旧JWT网关即时撤销 |
| 浏览器请求 | 549次请求，含静态资源及完整刷新，不是549次业务API；Supabase请求0、外部尝试0、页面异常0 |
| 服务端密钥保密检查 | 本轮84个客户端JS文件中当前服务API Key精确匹配0；不等同全仓秘密扫描 |
| Vercel准备前后只读核对 | 51项环境元数据的key/target/type/id精确一致；没有解密比对秘密值，不夸大为秘密值逐字节不变 |

**基础冒烟通过；排行榜完整功能未通过验收。** 两角色排行榜接口虽200，但均0条。新家从10-03起日报计数581，同起日service RPC仍200/0条；原有非空缺口保留，未改函数或统计口径。详见`leaderboard-read.json`，请求`e9c345de-7c0f-46be-a0ce-ae29e1f46ea3`、`ef2f43fe-0763-4a13-96d9-bc201fc1362b`。不能凭页面可打开写“随时可切”。

这些是本地生产构建单轮样本，缓存未受控，未做冷/热分层、首屏绘制或p95测量。尤其管理员大盘约11.3秒是导航至networkidle，不是首屏耗时，**不能证明3秒首屏目标达成**。

失败保留：①旧密钥健康503/过期401；②Playwright独立HTTP请求未沿用浏览器安全Cookie，身份401；③127.0.0.1来源请求403，改用localhost规范同源后真实浏览器退出200；④临时脚本混用Response字段导致undefined断言失败。均在私有目录按`expired-key-*`、`api-context-cookie-*`、`ip-origin-*`、`receipt-shape-*`保留。最终使用浏览器自身同源fetch读取和退出，不读/转存Cookie，不改应用来源校验，不绕过或放宽200/401断言；普通员工权限提示另有明确硬断言。IP来源403未在应用层修复，记录为本地地址限制，不推导Vercel域名已验证。

**未覆盖**：Vercel以新配置构建/运行、负责人本轮登录、真实业务写入、最后增量同步、全部历史查询口径、真实飞书/AI/OCR功能、监控送达、持续性能与长期密钥。既有角色门禁另见总报告，不能当本轮重跑。

## 六、执行包、切换前检查及回退

私有证据根：`/Users/mac/.local/share/dydata/review/2026-11-02-生产配置与总报告/`（目录700、文件600）。`target.env`为本地业务冒烟配置；`vercel-production-delta.env`只含5项新增值；`prepared-keys.json`与`vercel-env-metadata.json`为脱敏清单；`package-receipt.json`绑定文件SHA256；`build/types/start-receipt.json`保留命令、版本、时间及真实退出码；`smoke.cjs/smoke.json`保留断言和实测；过期密钥失败记录不覆盖。测试用密码临时副本已删除，复跑前可执行私有`prepare-test-credentials.py`从既有测试账号文档重新提取，结束删除该副本；不新增/重置账号。启动进程完成后已主动停止，start收据退出130为人工中断，不记成构建或冒烟失败。

将来执行仍须另获授权：核实服务密钥有效期、确认排行榜非空验收、备份来源并冻结写入、同步最后增量及全量对账、确认上线提交范围，再以同一组公共配置构建和部署。只改运行时值不会改变浏览器已编译开关。

回退准备：记录切换前部署与变量元数据；本轮新5项原本不存在，未来回退需移除/恢复这5项并恢复Supabase双开关及旧构建，不能只恢复密钥。旧38项保留原值。**切换后若已有新写入，先停写并核对新增数据如何回同步；直接把站点切回旧快照会丢失新写入。** 未执行上述任何线上动作。
