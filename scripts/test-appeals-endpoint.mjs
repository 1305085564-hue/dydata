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
  console.log("Testing query on fulfillment_appeals...");
  const { data, error } = await supabase
    .from("fulfillment_appeals")
    .select("id, user_id, record_date, reason, status, handler_id, handled_at, created_at")
    .limit(10);

  if (error) {
    console.error("Query failed:", error);
  } else {
    console.log("Query succeeded! Data count:", data.length);
    console.log("Sample row:", data[0]);
  }
}

run().catch(console.error);
