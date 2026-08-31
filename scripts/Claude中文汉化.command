#!/bin/bash
set -euo pipefail

# Claude Desktop 中文汉化一键脚本（上游 v1.4.7+）
# 上游仓库：https://github.com/javaht/claude-desktop-zh-cn
#
# 模式：完整补丁（改 app.asar）
#   比安全模式多换来：在线 claude.ai 页面 DOM 汉化、语言锁定、
#   第三方模型名本地校验绕过、app.asar 内模型选择器汉化。
#   需要安全模式时，把下面的 MODE 改成 "safe" 即可，其余不用动。
#
# 配套：关闭官方自动更新（根治"官方更新冲掉汉化"）

MODE="full"          # full = 完整补丁 | safe = 安全模式（不改 app.asar）
REPO="$HOME/Projects/claude-desktop-zh-cn"
PY="/usr/bin/python3"
[ -x "$PY" ] || PY="$(command -v python3)"
HOME_ARG=(--user-home "$HOME")   # sudo 下必须显式传，否则配置会写进 root 目录

PATCH_ARGS=("${HOME_ARG[@]}" --lang zh-CN --launch)
[ "$MODE" = "safe" ] && PATCH_ARGS+=(--skip-asar-patch)

echo "🀄 Claude Desktop 中文汉化 —— $([ "$MODE" = "safe" ] && echo 安全模式 || echo 完整模式)"
echo "================================================"

# 1. 退出 Claude，否则补丁写不进去
if pgrep -x "Claude" >/dev/null 2>&1; then
  echo "⏏  正在退出 Claude Desktop..."
  osascript -e 'tell application "Claude" to quit' >/dev/null 2>&1 || true
  for i in $(seq 1 15); do
    pgrep -x "Claude" >/dev/null 2>&1 || break
    sleep 1
  done
  if pgrep -x "Claude" >/dev/null 2>&1; then
    echo "❌ Claude 仍在运行，请手动退出后重新运行本脚本"
    exit 1
  fi
fi

# 2. 拉取上游最新汉化包（没有就克隆）
echo "🔄 拉取最新汉化包..."
if [ -d "$REPO/.git" ]; then
  git -C "$REPO" pull --ff-only --quiet 2>&1 | tail -3 || echo "⚠️  更新失败，改用本地已有版本"
else
  rm -rf "$REPO"
  git clone --depth 1 https://github.com/javaht/claude-desktop-zh-cn.git "$REPO" 2>&1 | tail -2
fi
VERSION="$("$PY" -c "import json;print(json.load(open('$REPO/resources/release.json'))['release'])" 2>/dev/null || echo 未知)"
echo "   汉化包版本：$VERSION"

# 3. 清理旧备份只留最新 1 个
#    原因：--restore 恢复的是"最老"的备份。留着旧版本的备份会导致还原时
#    把 Claude 降级（例如退回 1.30096.5）。只保留与当前同版本的那个最稳。
echo ""
BACKUPS=()
while IFS= read -r line; do BACKUPS+=("$line"); done < <(ls -1d /Applications/Claude.backup-before-zh-CN-*.app 2>/dev/null | sort)
if [ "${#BACKUPS[@]}" -gt 1 ]; then
  echo "🧹 旧备份移入废纸篓（只保留最新的 1 个，避免还原时版本降级）："
  for f in "${BACKUPS[@]:0:${#BACKUPS[@]}-1}"; do
    echo "   $(basename "$f")"
    osascript -e "tell application \"Finder\" to delete POSIX file \"$f\"" >/dev/null 2>&1 || true
  done
fi

# 4. 还原到干净英文状态，避免新旧补丁叠加（需要开机密码）
echo ""
echo "🧽 清理上一轮补丁..."
sudo "$PY" "$REPO/scripts/patch_claude_zh_cn.py" "${HOME_ARG[@]}" --restore-if-backup-exists

# 5. 打补丁
echo ""
echo "🛠  开始汉化（需要输入开机密码）..."
sudo "$PY" "$REPO/scripts/patch_claude_zh_cn.py" "${PATCH_ARGS[@]}"

# 6. 根治：关掉官方自动更新，否则下次更新又会冲掉汉化
echo ""
echo "🔒 关闭 Claude 自动更新..."
sudo "$PY" "$REPO/scripts/patch_claude_zh_cn.py" "${HOME_ARG[@]}" --set-auto-updates disabled

# 7. 收尾清理：备份保留最近 2 个（本轮刚生成的 + 上一个可用回退点）
echo ""
KEEP=2
OLD=()
while IFS= read -r line; do OLD+=("$line"); done < <(ls -1d /Applications/Claude.backup-before-zh-CN-*.app 2>/dev/null | sort | head -n -"$KEEP")
if [ "${#OLD[@]}" -gt 0 ]; then
  echo "🧹 旧备份移入废纸篓（保留最近 $KEEP 个）："
  for f in "${OLD[@]}"; do
    echo "   $(basename "$f")"
    osascript -e "tell application \"Finder\" to delete POSIX file \"$f\"" >/dev/null 2>&1 || true
  done
fi

echo ""
echo "✅ 完成！如果界面还是英文：左下角账号菜单 → Language → 简体中文"
echo ""
echo "提示："
echo "  · 自动更新已关闭。日后手动升级 Claude 后，重新双击本文件即可。"
echo "  · 要回退到官方英文：跑 sudo $PY $REPO/scripts/patch_claude_zh_cn.py --user-home \$HOME --restore"
echo "  · 完整模式不保证 Cowork 沙箱可用；需要 Cowork 时把脚本顶部 MODE 改成 safe。"
