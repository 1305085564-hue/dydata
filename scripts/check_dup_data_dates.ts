import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const pairs = [
  ['张超', '赵宇'],
  ['猎龙侦探', '王东菊'],
  ['股建贝聿铭', '张玥晗'],
  ['金田路道哥', '江季芸'],
]

async function main() {
  for (const [nick, real] of pairs) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, team_id, group_id, created_at')
      .in('name', [nick, real])

    console.log(`\n=== ${nick} vs ${real} ===`)
    for (const p of profiles ?? []) {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('report_date')
        .eq('user_id', p.id)
        .order('report_date', { ascending: false })
        .limit(3)

      const dates = reports?.map(r => r.report_date).join(', ') ?? '无'
      const count = reports?.length ?? 0
      console.log(`  ${p.name} | id=${p.id.slice(0,8)} | group=${p.group_id ? '有' : '无'} | 最近3条:${dates} | 创建=${p.created_at.slice(0,10)}`)
    }
  }
}

main()
