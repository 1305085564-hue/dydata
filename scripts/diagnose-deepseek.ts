import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnoseDeeseekVisibility() {
  console.log('=== 诊断 DeepSeek 模型不显示的问题 ===\n');

  // 查询所有 DeepSeek 相关模型
  const { data: deepseekModels } = await supabase
    .from('ai_provider_key_models')
    .select('key_id, model_id, display_name, is_enabled, global_is_enabled')
    .or('model_id.ilike.%deepseek%');

  console.log(`找到 ${deepseekModels?.length || 0} 个 DeepSeek 模型记录：\n`);

  if (!deepseekModels || deepseekModels.length === 0) {
    console.log('❌ 数据库中没有 DeepSeek 模型');
    return;
  }

  // 按 model_id 分组
  const byModel = new Map<string, any[]>();
  for (const m of deepseekModels) {
    if (!byModel.has(m.model_id)) {
      byModel.set(m.model_id, []);
    }
    byModel.get(m.model_id)!.push(m);
  }

  for (const [modelId, records] of byModel.entries()) {
    console.log(`模型: ${modelId}`);
    console.log(`  共 ${records.length} 个渠道记录：`);

    let hasEnabledChannel = false;
    let globalState: boolean | null = null;

    for (const r of records) {
      console.log(`    - 渠道: ${r.key_id.slice(0, 8)}... | is_enabled: ${r.is_enabled} | global_is_enabled: ${r.global_is_enabled}`);

      if (r.is_enabled) {
        hasEnabledChannel = true;
      }

      // 聚合 global_is_enabled
      if (r.global_is_enabled !== undefined && r.global_is_enabled !== null) {
        if (globalState === null || globalState === false) {
          globalState = r.global_is_enabled;
        } else if (r.global_is_enabled === true) {
          globalState = true;
        }
      }
    }

    console.log(`  判断结果：`);
    console.log(`    - 有渠道启用: ${hasEnabledChannel ? '✓ 是' : '✗ 否'}`);
    console.log(`    - 聚合的 global_is_enabled: ${globalState}`);
    console.log(`    - 按我的修复逻辑应该显示: ${hasEnabledChannel ? '✓ 是' : '✗ 否'}\n`);
  }

  // 检查 ds 渠道的状态
  console.log('\n=== 检查 ds 渠道状态 ===');
  const { data: dsKey } = await supabase
    .from('ai_provider_keys')
    .select('id, label, is_enabled')
    .ilike('label', '%ds%')
    .single();

  if (dsKey) {
    console.log(`渠道: ${dsKey.label}`);
    console.log(`  ID: ${dsKey.id}`);
    console.log(`  is_enabled: ${dsKey.is_enabled}`);

    const { data: dsModels } = await supabase
      .from('ai_provider_key_models')
      .select('model_id, is_enabled, global_is_enabled')
      .eq('key_id', dsKey.id);

    console.log(`  挂载模型: ${dsModels?.length || 0} 个`);
    dsModels?.forEach(m => {
      console.log(`    - ${m.model_id}: is_enabled=${m.is_enabled}, global=${m.global_is_enabled}`);
    });
  }
}

diagnoseDeeseekVisibility()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('错误:', err);
    process.exit(1);
  });
