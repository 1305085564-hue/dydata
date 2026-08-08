#!/bin/bash
set -euo pipefail

REPO_DIR="/tmp/claude-desktop-zh-cn"
SCRIPT="$REPO_DIR/scripts/patch_claude_zh_cn.py"

echo "🔄 更新汉化补丁..."
cd /tmp && rm -rf claude-desktop-zh-cn
git clone --depth 1 https://github.com/javaht/claude-desktop-zh-cn.git 2>&1

echo ""
echo "🀄 开始汉化 Claude Desktop..."
sudo /usr/bin/python3 "$SCRIPT" --skip-asar-patch --lang zh-CN --launch

echo ""
echo "✅ 完成！如果界面没变，重启 Claude 后在左下角 Language 选简体中文"
