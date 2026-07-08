# Win 电脑 Codex 迁移说明书

这份文档可以直接发给 Win 电脑上的 Codex。

它的目标只有一个：

- 把阿禅给你的那批文件，正确放到 Win 电脑该放的位置
- 让你以后在这台 Win 电脑上维护 DYData 时，拥有必要的项目上下文和长期记忆

注意：

- 这台 Win 电脑只有 Codex，没有 Claude Code
- 所以不要创建 Claude 的记忆目录
- 所有长期记忆只放到 Codex 自己的目录

---

## 1. 你会收到什么

阿禅会给你一批文件。

你不用知道这些文件原来在他 Mac 上哪里。
你只需要按“文件名”和“目标位置”来落地。

你收到的内容应分成两组：

### A. 项目文件

这些文件应该被放进 `dydata` 项目仓库里：

- `AGENTS.md`
- `README.md`
- `维护交接清单.md`
- `Win电脑搭环境.md`
- `数据口径.md`
- `截图上传维护手册.md`
- `Win电脑-Codex记忆迁移清单.md`

### B. 记忆源文件

这些文件不是直接长期存放用的，而是给你提炼成 Codex 全局记忆用的：

- `DYData-项目记忆总览.md`
- `DYData-待修复问题.md`
- `DYData-踩坑记录.md`
- `通用纠错记录.md`

如果你收到的不是这些名字，而是阿禅另外打包好的版本，也没关系。
只要内容大意对应就行。

---

## 2. Win 电脑最终应该放成什么样

### A. 项目仓库里的文件

假设项目目录是：

```text
C:\Users\你的用户名\Projects\dydata\
```

那么项目文件要放成这样：

```text
dydata\
  AGENTS.md
  README.md
  docs\
    维护交接清单.md
    Win电脑搭环境.md
    数据口径.md
    截图上传维护手册.md
    Win电脑-Codex记忆迁移清单.md
```

说明：

- `AGENTS.md` 和 `README.md` 放项目根目录
- 其他文档放 `docs\` 目录
- 如果 `docs\` 不存在，就创建

### B. Codex 全局记忆文件

Win 电脑上的 Codex 长期记忆统一放这里：

```text
%USERPROFILE%\.codex\memory\
```

最终只保留这 3 个长期记忆文件：

- `DYData-项目硬规则.md`
- `DYData-项目状态.md`
- `DYData-踩坑与排查.md`

也就是最终应该长这样：

```text
%USERPROFILE%\.codex\memory\
  DYData-项目硬规则.md
  DYData-项目状态.md
  DYData-踩坑与排查.md
```

---

## 3. 明确不要做的事

不要做这些：

- 不要创建 `.claude\` 目录
- 不要把整份 Claude 记忆原样搬过来
- 不要迁协同规则
- 不要迁全量日志
- 不要把阶段性设计稿、验收报告、规格书全塞进长期记忆

原因：

- 这台机器没有 Claude Code，Claude 那套目录和规则没意义
- 长期记忆只该保留“稳定、常用、能反复帮上忙”的结论
- 噪音太多会让 Codex 判断变慢、变偏

---

## 4. 你要先做什么

按顺序做：

1. 找到本机的 `dydata` 项目目录
2. 把项目文件放到第 2 节写的位置
3. 确认 `%USERPROFILE%\.codex\memory\` 是否存在
4. 如果不存在，就创建
5. 读取那 4 个“记忆源文件”
6. 把里面真正长期有用的结论，整理成 3 个 Codex 全局记忆文件

如果 `%USERPROFILE%\.codex\memory\` 不存在，可用 PowerShell 创建：

```powershell
mkdir $env:USERPROFILE\.codex\memory
```

---

## 5. 3 个 Codex 长期记忆分别写什么

这是最关键的部分。
不要照抄全部原文，只保留长期有用的结论。

### A. `DYData-项目硬规则.md`

这份只写“不能乱动的硬规则”。

应该包含：

- DYData 部署只走 Vercel
- `push main` 会自动部署
- 正式域名：`dydata.cc`
- 备用域名：`dydata.vercel.app`
- Git 远端应是正式仓库
- `git user.email` 必须是 `1305085564@qq.com`
- 不改旧 migration，只能新增 migration
- 不直接改线上 `.env`
- 服务端接口用 `SUPABASE_SERVICE_ROLE_KEY`
- 不要误用 anon key 处理服务端逻辑
- `cron` 接口兼容 `CRON_SECRET` 和 `REMIND_SECRET`
- 改配置前先读原文
- 不要看到历史残留配置就擅自改部署方式

### B. `DYData-项目状态.md`

这份只写“项目现在进行到哪了”。

应该包含：

- 当前部署平台还是 Vercel
- migration `001-034` 已执行，`035` 跳过
- 截图数据实际在 `video_metrics_snapshots`
- 不在 `content_asset`
- 后台重构前 3 批已完成
- 第 4、5 批目前搁置
- 当前重要待排查问题：
- `/admin/analytics` Application Error
- 管理后台“权限管理”显示异常时，先核对账号 role 是否真是 `owner`

### C. `DYData-踩坑与排查.md`

这份只写“遇到问题先想到什么”。

应该包含：

- Vercel 部署失败时，先查 `git author email`
- `cron Unauthorized` 时，先查是不是只认了 `REMIND_SECRET`
- `cron` 查不到数据时，先查是否误用了 anon key
- 后台/导航异常时，先查是不是查了未执行 migration 的列
- migration 执行报错时，先查是否跳号执行
- 线上报错时，先确认表和字段是否真的存在
- Next.js / TypeScript 连锁报错时，先查共用类型和必填 props

---

## 6. 哪 4 个源文件最值得读

只读这 4 个就够了，不需要更多：

- `DYData-项目记忆总览.md`
- `DYData-待修复问题.md`
- `DYData-踩坑记录.md`
- `通用纠错记录.md`

它们的作用分别是：

- `DYData-项目记忆总览.md`
  作用：看项目整体状态
- `DYData-待修复问题.md`
  作用：看当前还没收尾的真问题
- `DYData-踩坑记录.md`
  作用：看这个项目以前踩过哪些坑
- `通用纠错记录.md`
  作用：看通用排查经验

注意：

- 这 4 个只是“原料”
- 不要长期原样堆着
- 读完后，把结论合并到第 5 节那 3 份长期记忆里

---

## 7. 如果你收到的是一个压缩包

最稳的做法是把压缩包先解压成一个临时目录，比如：

```text
C:\Users\你的用户名\Desktop\dydata-transfer\
```

建议里面长这样：

```text
dydata-transfer\
  项目文件\
    AGENTS.md
    README.md
    维护交接清单.md
    Win电脑搭环境.md
    数据口径.md
    截图上传维护手册.md
    Win电脑-Codex记忆迁移清单.md
  记忆源文件\
    DYData-项目记忆总览.md
    DYData-待修复问题.md
    DYData-踩坑记录.md
    通用纠错记录.md
```

然后你按第 2 节放到目标位置就行。

如果文件夹名字不同，也没关系。
关键是按文件内容分类，不是按原路径。

---

## 8. 落地完成后的自检

完成后，检查这 3 件事：

1. `dydata` 项目里能看到 `AGENTS.md`、`README.md` 和 `docs\` 下那几份文档
2. `%USERPROFILE%\.codex\memory\` 下只存在那 3 份 DYData 长期记忆
3. 没有额外创建 `.claude\` 目录

如果这 3 条都满足，就说明迁移方式对了。

---

## 9. 一句话原则

这次迁移要做的是：

- 把 DYData 的项目知识迁到 Win 上的 Codex

不是：

- 把 Mac 上整套 Claude / Codex / 日志 / 协作体系整包复制过去
