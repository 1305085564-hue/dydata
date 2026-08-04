#!/usr/bin/env bash
set -euo pipefail

# This runbook is intentionally dry-run by default. Production execution needs
# an explicit confirmation and a separate human review of the migration list.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

repair_command=(
  supabase migration repair
  20260804120000
  20260805100000
  20260805113000
  --status applied
  --linked
)

echo "发布前必须确认：只执行 lifecycle 生产兼容 migration 和写保护 migration，不能使用 supabase db push。"
echo "执行前检查：supabase migration list --linked，并确认没有把其他 pending migration 带入本次发布。"
echo "1) 在 Supabase SQL Editor 执行 supabase/migrations/20260805113000_member_lifecycle_production_compat.sql。"
echo "2) 在 Supabase SQL Editor 执行 supabase/migrations/20260805100000_member_lifecycle_write_protection.sql。"
printf '3)'
printf ' %q' "${repair_command[@]}"
printf '\n4) 在 Supabase SQL Editor 执行：NOTIFY pgrst, '\''reload schema'\'';\n'
echo "5) 用 service-role 请求 /rest/v1/profiles 的 OpenAPI 元数据，确认 membership_status 已进入 schema cache。"
echo "6) 用 owner、active、archived、restore 后账号完成真实角色验收和历史数据数量对账。"

if [[ "${MEMBER_LIFECYCLE_RELEASE_CONFIRM:-}" != "1" ]]; then
  echo "当前为 dry-run，未执行任何生产操作。"
  exit 0
fi

if [[ "${MEMBER_LIFECYCLE_SQL_APPLIED:-}" != "1" ]]; then
  echo "拒绝 repair：必须先精确执行生产兼容与写保护 migration，并设置 MEMBER_LIFECYCLE_SQL_APPLIED=1。" >&2
  exit 1
fi

"${repair_command[@]}"
echo "migration history 已 repair；仍需 reload schema、确认 OpenAPI 字段并完成真实角色验收。"
