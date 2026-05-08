import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const merges = [
  ['王东菊', '猎龙侦探'],
  ['张玥晗', '股建贝聿铭'],
  ['江季芸', '金田路道哥'],
]

async function main() {
  for (const [from, to] of merges) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('name', [from, to])

    const fromId = profiles?.find(p => p.name === from)?.id
    const toId = profiles?.find(p => p.name === to)?.id

    if (!fromId || !toId) continue

    const { data: fromDates } = await supabase
      .from('daily_reports')
      .select('report_date')
      .eq('user_id', fromId)

    const { data: toDates } = await supabase
      .from('daily_reports')
      .select('report_date')
      .eq('user_id', toId)

    const fromSet = new Set(fromDates?.map(d => d.report_date) ?? [])
    const toSet = new Set(toDates?.map(d => d.report_date) ?? [])
    const conflicts = [...fromSet].filter(d => toSet.has(d))

    console.log(`${from}→${to}: ${fromDates?.length ?? 0}条 vs ${toDates?.length ?? 0}条 | 冲突日期:${conflicts.length}个`)
    if (conflicts.length > 0) {
      console.log(`  冲突日期: ${conflicts.join(', ')}`)
    }
  }
}

main()
