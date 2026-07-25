import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve('./.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const tables = ['profiles', 'fulfillment_records', 'violations', 'fulfillment_appeals'];
  for (const t of tables) {
    const { error, data } = await supabase.from(t).select('*').limit(1);
    console.log(`Table ${t} query result:`, error ? `Error: ${error.message}` : `Success! Count: ${data.length}`);
  }
}

run().catch(console.error);
