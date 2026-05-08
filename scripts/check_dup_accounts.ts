import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const names = ['张超', '赵宇', '猎龙侦探', '王东菊', '股建贝聿铭', '张玥晗', '金田路道哥', '江季芸']

async function main() {
  // 查 profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, role, status, team_id, group_id, created_at')
    .in('name', names)
    .order('created_at')

  console.log('=== 相关账号信息 ===')
  for (const p of profiles ?? []) {
    // 查 daily_reports 数量
    const { count: drCount } = await supabase
      .from('daily_reports')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', p.id)

    // 查 submissions 数量
    const { count: subCount } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', p.id)

    const hasData = (drCount ?? 0) > 0 || (subCount ?? 0) > 0
    console.log(`${p.name} | id=${p.id.slice(0,8)} | role=${p.role} | team=${p.team_id ? '有' : '无'} | group=${p.group_id ? '有' : '无'} | daily=${drCount ?? 0} | sub=${subCount ?? 0} | 有数据=${hasData} | 创建=${p.created_at}`)
  }
}

main()
