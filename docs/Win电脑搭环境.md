# Win 电脑搭环境 — 给 Claude Code 的指令

> 阿禅：在 Win 电脑打开 Claude Code，把这份文档给它看，跟它说「按这个文档帮我搭环境」就行。
> 你不需要自己操作任何步骤。

---

## 给 Claude Code 的指令

你正在帮阿禅在一台新的 Windows 电脑上搭建 DYData 项目的开发环境。阿禅不懂代码，所有操作由你完成。

### 前置条件检查

依次检查以下工具是否已安装，没装的告诉阿禅怎么装（他只需要点下载链接、一路下一步）：

| 工具 | 检查命令 | 没装的话 |
|------|---------|---------|
| Node.js | `node -v` | 让阿禅去 https://nodejs.org 下载 LTS 版，一路下一步 |
| Git | `git --version` | 让阿禅去 https://git-scm.com/download/win 下载，一路下一步 |

装完后阿禅需要重启终端，你再重新检查。

### 第一步：把代码从 GitHub 下载到本地

```bash
git clone https://github.com/1305085564-hue/dydata.git
cd dydata
```

如果失败，可能是网络问题，提醒阿禅检查代理/VPN。

### 第二步：配 Git 身份

```bash
git config user.email "1305085564@qq.com"
git config user.name "1305085564-1671"
```

### 第三步：创建环境变量文件

在项目根目录创建 `.env.local` 文件，内容如下：

```
NEXT_PUBLIC_SUPABASE_URL=https://mkkvnogkqcupvxmnoefy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_HgnAruedys9pFYZaAchc1Q__MP8bUTs
SUPABASE_SERVICE_ROLE_KEY=sb_secret_wmKE_0m2j6YEsLIEL1057w_-0j22MbT
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/9bd6cf6a-922b-4f60-8913-ce3223135890
CRON_SECRET=dydata-remind-2026
REMIND_SECRET=dydata-remind-2026
```

### 第四步：安装依赖并验证

```bash
npm install
npm run build
```

如果 build 成功，环境就搭好了。

### 第五步：启动开发服务器

告诉阿禅在终端里运行：

```bash
npm run dev
```

然后打开浏览器访问 http://localhost:3000 ，能看到页面就成功了。

### 完成后告诉阿禅

- 环境搭好了
- 以后改完代码，push 到 main 分支就会自动部署到线上
- 两台电脑（Mac 和 Win）共用同一个代码仓库，互不冲突
