#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gcrhhxaopomtposmahsw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺少 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('=== 验证 v2 表结构 ===\n');

// 1. 检查 rewrite_conversations.schema_version
console.log('1. 检查 rewrite_conversations.schema_version 列...');
const { data: convData, error: convError } = await supabase
  .from('rewrite_conversations')
  .select('id, schema_version')
  .limit(1);

if (convError) {
  console.error('❌ 失败:', convError.message);
} else {
  console.log('✓ schema_version 列存在');
}

// 2. 检查 rewrite_documents 表
console.log('\n2. 检查 rewrite_documents 表...');
const { data: docData, error: docError } = await supabase
  .from('rewrite_documents')
  .select('id')
  .limit(1);

if (docError) {
  console.error('❌ 失败:', docError.message);
} else {
  console.log('✓ rewrite_documents 表存在');
}

// 3. 检查 rewrite_skills 表
console.log('\n3. 检查 rewrite_skills 表...');
const { data: skillData, error: skillError } = await supabase
  .from('rewrite_skills')
  .select('id')
  .limit(1);

if (skillError) {
  console.error('❌ 失败:', skillError.message);
} else {
  console.log('✓ rewrite_skills 表存在');
}

// 4. 检查 ai_providers 表
console.log('\n4. 检查 ai_providers 表...');
const { data: providerData, error: providerError } = await supabase
  .from('ai_providers')
  .select('id')
  .limit(1);

if (providerError) {
  console.error('❌ 失败:', providerError.message);
} else {
  console.log('✓ ai_providers 表存在');
}

// 5. 尝试创建 v2 会话
console.log('\n5. 测试创建 v2 会话（插入 schema_version: 2）...');
const testUserId = 'a689874f-12f1-43e1-8e20-87e2195fe041';
const { data: newConv, error: createError } = await supabase
  .from('rewrite_conversations')
  .insert({
    user_id: testUserId,
    title: '[测试] v2 会话验证',
    schema_version: 2,
    auto_mode_enabled: false,
  })
  .select('id, schema_version')
  .single();

if (createError) {
  console.error('❌ 创建失败:', createError.message);
} else {
  console.log('✓ 创建成功，会话 ID:', newConv.id, ', schema_version:', newConv.schema_version);

  // 清理测试数据
  await supabase.from('rewrite_conversations').delete().eq('id', newConv.id);
  console.log('✓ 测试数据已清理');
}

console.log('\n=== 验证完成 ===');
