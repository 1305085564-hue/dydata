import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data: groups } = await supabase.from('groups').select('id, name').order('name')
  const groupMap = new Map(groups?.map(g => [g.name, g.id]))

  // 真账号（昵称）入组
  const realAccounts = [
    { name: '猎龙侦探', groupName: '第三组' },
    { name: '股建贝聿铭', groupName: '第一组' },
    { name: '金田路道哥', groupName: '第二组' },
  ]

  // 后加的本名出组
  const fakeNames = ['王东菊', '张玥晗', '江季芸']

  for (const { name, groupName } of realAccounts) {
    const gid = groupMap.get(groupName)
    if (!gid) continue
    const { error } = await supabase.from('profiles').update({ group_id: gid }).eq('name', name)
    if (error) console.error(`${name} 入组失败:`, error)
    else console.log(`${name} → ${groupName}`)
  }

  for (const name of fakeNames) {
    const { error } = await supabase.from('profiles').update({ group_id: null }).eq('name', name)
    if (error) console.error(`${name} 出组失败:`, error)
    else console.log(`${name} → 未分配`)
  }
}

main()
