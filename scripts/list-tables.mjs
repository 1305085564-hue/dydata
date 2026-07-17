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

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Listing tables in public schema...");
  const { data, error } = await supabase.rpc('get_tables'); // Check if there's get_tables or use SQL query

  // Since we might not have a get_tables RPC, let's run a select query on pg_catalog via REST API (if allowed) or via standard query.
  // We can query pg_tables using supabase.from("pg_tables")? No, pg_catalog is not exposed via PostgREST by default.
  // Wait! Let's try querying a few table names to see if they exist:
  const tables = [
    'profiles',
    'fulfillment_records',
    'fulfillment_appeals',
    'violations',
    'teams',
    'groups'
  ];

  for (const t of tables) {
    const { error: tableError } = await supabase.from(t).select('count', { count: 'exact', head: true });
    if (tableError) {
      console.log(`- Table '${t}': Error ->`, tableError.message);
    } else {
      console.log(`- Table '${t}': Exists!`);
    }
  }
}

run().catch(console.error);
