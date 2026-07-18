import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve('./.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DYDATA_RESET_EMAIL;
const newPassword = process.env.DYDATA_RESET_PASSWORD;
const OWNER_EMAIL = '1305085564@qq.com';

if (!supabaseUrl || !serviceRoleKey || !email || !newPassword) {
  console.error("Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DYDATA_RESET_EMAIL, DYDATA_RESET_PASSWORD");
  process.exit(1);
}

if (email === OWNER_EMAIL && process.env.DYDATA_CONFIRM_OWNER_RESET !== 'YES') {
  console.error("Refusing to reset owner password without DYDATA_CONFIRM_OWNER_RESET=YES");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
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

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: newPassword }
  );

  if (updateError) {
    console.error("Error resetting password:", updateError);
  } else {
    console.log("Password successfully reset.");
  }
}

run().catch(console.error);
