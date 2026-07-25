import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const moves = [
  { nick: '猎龙侦探', real: '王东菊' },
  { nick: '股建贝聿铭', real: '张玥晗' },
  { nick: '金田路道哥', real: '江季芸' },
]

async function main() {
  for (const { nick, real } of moves) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, group_id')
      .in('name', [nick, real])

    const nickProfile = profiles?.find(p => p.name === nick)
    const realProfile = profiles?.find(p => p.name === real)

    if (!nickProfile || !realProfile) {
      console.log(`跳过 ${nick}/${real}: 找不到账号`)
      continue
    }

    // 昵称账号移入本名账号的组
    const { error: e1 } = await supabase
      .from('profiles')
      .update({ group_id: realProfile.group_id })
      .eq('id', nickProfile.id)

    if (e1) {
      console.error(`${nick} 入组失败:`, e1)
      continue
    }

    // 本名账号移出分组
    const { error: e2 } = await supabase
      .from('profiles')
      .update({ group_id: null })
      .eq('id', realProfile.id)

    if (e2) {
      console.error(`${real} 出组失败:`, e2)
      continue
    }

    console.log(`${nick}→入组 | ${real}→出组（数据保留）`)
  }
}

main()
