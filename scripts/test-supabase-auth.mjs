import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve('./.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Anon Key length:", supabaseAnonKey ? supabaseAnonKey.length : 0);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase env vars!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  console.log("Attempting sign-in...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: '1305085564@qq.com',
    password: 'dydata123456'
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
