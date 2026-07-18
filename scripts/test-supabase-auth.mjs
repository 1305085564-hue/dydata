import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve('./.env.local') });
dotenv.config({ path: path.resolve('./.env.ai-test.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.DYDATA_TEST_EMAIL ?? process.env.DYDATA_AI_TEST_EMAIL;
const password = process.env.DYDATA_TEST_PASSWORD ?? process.env.DYDATA_AI_TEST_PASSWORD;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Anon Key length:", supabaseAnonKey ? supabaseAnonKey.length : 0);

if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
  console.error("Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and test account vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  console.log("Attempting sign-in...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Login failed:", error.message);
  } else {
    console.log("Login successful!");
    console.log("User ID:", data.user?.id);
    console.log("User Email:", data.user?.email);
  }
}

testLogin().catch(console.error);
