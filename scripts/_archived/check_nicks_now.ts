import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const names = ['猎龙侦探', '股建贝聿铭', '金田路道哥', '王东菊', '张玥晗', '江季芸']

async function main() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, role, team_id, group_id, created_at')
    .in('name', names)
    .order('created_at')

  console.log('=== 当前账号状态 ===')
  for (const p of profiles ?? []) {
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('report_date')
      .eq('user_id', p.id)
      .order('report_date', { ascending: false })
      .limit(3)

    const { count: total } = await supabase
      .from('daily_reports')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', p.id)

    const dates = reports?.map(r => r.report_date).join(', ') ?? '无'
    const groupStatus = p.group_id ? '已分配' : '未分配'
    console.log(`${p.name} | id=${p.id.slice(0,8)} | 创建=${p.created_at.slice(0,10)} | 数据=${total ?? 0}条 | 最近=${dates} | 分组=${groupStatus}`)
  }
}

main()
