import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve('./.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  const email = '1305085564@qq.com';
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.error("Error listing users:", listError);
    return;
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    console.error(`User with email ${email} not found!`);
    return;
  }

  console.log(`Found user: ID=${user.id}, Email=${user.email}. Resetting password...`);

  const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: 'dydata123456' }
  );

  if (updateError) {
    console.error("Error resetting password:", updateError);
  } else {
    console.log("Password successfully reset to: dydata123456");
  }
}

run().catch(console.error);
