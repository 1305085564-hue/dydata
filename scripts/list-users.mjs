import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve('/Users/mac/Projects/dydata/.env.local') });

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
  console.log("Fetching users...");
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error listing users:", error);
    return;
  }

  console.log(`Found ${users.length} users:`);
  for (const user of users) {
    console.log(`- ID: ${user.id}, Email: ${user.email}, Last Sign In: ${user.last_sign_in_at}`);
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, role, email');
  
  if (profileError) {
    console.error("Error fetching profiles:", profileError);
    return;
  }

  console.log("\nProfiles:");
  for (const profile of profiles) {
    console.log(`- ID: ${profile.id}, Name: ${profile.name}, Email: ${profile.email}, Role: ${profile.role}`);
  }
}

run();
