import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mkkvnogkqcupvxmnoefy.supabase.co',
  'sb_publishable_HgnAruedys9pFYZaAchc1Q__MP8bUTs'
);

const { data, error } = await supabase
  .from('profiles')
  .select('name, role, permissions');

console.log('所有用户:', JSON.stringify(data, null, 2));
if (error) console.error('错误:', error);
