#!/bin/bash
# 站内 AI 助手 - 代码完整性验证脚本

set -e

echo "========================================="
echo "站内 AI 助手 - 代码完整性验证"
echo "========================================="
echo ""

# 检查必需文件
echo "✓ 检查文件完整性..."

files=(
  "supabase/migrations/037_admin_ai_assistant.sql"
  "src/lib/admin-ai/core.ts"
  "src/lib/admin-ai/core.test.ts"
  "src/lib/admin-tools/index.ts"
  "src/lib/admin-tools/types.ts"
  "src/lib/admin-tools/utils.ts"
  "src/lib/admin-tools/user-management.ts"
  "src/lib/admin-tools/data-query.ts"
  "src/lib/admin-tools/data-correction.ts"
  "src/lib/admin-tools/task-management.ts"
  "src/lib/admin-tools/diagnosis.ts"
  "src/app/api/admin/ai-assistant/route.ts"
  "src/app/api/admin/ai-assistant/history/route.ts"
  "src/app/api/admin/ai-assistant/history/[id]/route.ts"
  "src/app/api/admin/ai-assistant/confirm/route.ts"
  "src/app/api/admin/ai-assistant/_shared.ts"
  "src/app/(app)/admin/ai-assistant/page.tsx"
  "src/app/(app)/admin/ai-assistant/chat-panel.tsx"
  "src/app/(app)/admin/ai-assistant/confirm-card.tsx"
  "src/app/(app)/admin/ai-assistant/history-sidebar.tsx"
  "src/app/(app)/admin/ai-assistant/action-detail-drawer.tsx"
)

missing=0
for file in "${files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "  ✗ 缺失: $file"
    missing=$((missing + 1))
  fi
done

if [ $missing -eq 0 ]; then
  echo "  ✓ 所有文件完整 (${#files[@]} 个)"
else
  echo "  ✗ 缺失 $missing 个文件"
  exit 1
fi

echo ""
echo "✓ 检查 TypeScript 编译..."
npx tsc --noEmit --skipLibCheck 2>&1 | head -20

echo ""
echo "========================================="
echo "验证完成"
echo "========================================="
echo ""
echo "下一步："
echo "1. 执行 migration: 访问 Supabase Dashboard"
echo "2. 启动服务器: npm run dev"
echo "3. 手动测试: 参考 站内AI助手-测试执行指引.md"
