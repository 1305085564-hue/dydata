#!/usr/bin/env node
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gcrhhxaopomtposmahsw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺少 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('用法: node scripts/apply-single-migration.mjs <migration-file>');
  process.exit(1);
}

const sql = readFileSync(migrationFile, 'utf-8');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log(`正在执行 ${migrationFile}...`);

const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
  console.error('执行失败:', error);
  process.exit(1);
}

console.log('执行成功');
console.log('返回数据:', data);
