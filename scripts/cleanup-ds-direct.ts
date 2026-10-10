import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanupDsChannel() {
  console.log('开始清理 ds 渠道的数据污染...\n');

  // 查询 ds 渠道
  const { data: keys } = await supabase
    .from('ai_provider_keys')
    .select('id, label')
    .ilike('label', '%ds%');

  if (!keys || keys.length === 0) {
    console.log('❌ 未找到 ds 渠道');
    return;
  }

  const dsKey = keys.find(k => k.label.toLowerCase().includes('ds'));
  if (!dsKey) {
    console.log('❌ 未找到 ds 渠道');
    return;
  }

  console.log(`✓ 找到渠道: "${dsKey.label}" (ID: ${dsKey.id})\n`);

  // 查询该渠道的所有模型
  const { data: models } = await supabase
    .from('ai_provider_key_models')
    .select('id, model_id, display_name, is_enabled')
    .eq('key_id', dsKey.id);

  if (!models || models.length === 0) {
    console.log('该渠道没有模型');
    return;
  }

  // 分类：DeepSeek 模型 vs 其他模型
  const deepseekModels = models.filter(m =>
    m.model_id.toLowerCase().includes('deepseek')
  );
  const otherModels = models.filter(m =>
    !m.model_id.toLowerCase().includes('deepseek')
  );

  console.log(`当前挂载模型: ${models.length} 个`);
  console.log(`  - DeepSeek 模型: ${deepseekModels.length} 个`);
  deepseekModels.forEach(m => {
    console.log(`    ✓ ${m.model_id} (${m.is_enabled ? '已启用' : '未启用'})`);
  });

  if (otherModels.length > 0) {
    console.log(`  - 非 DeepSeek 模型: ${otherModels.length} 个 (应该删除)`);
    otherModels.forEach(m => {
      console.log(`    × ${m.model_id}`);
    });

    // 确认删除
    console.log('\n准备删除非 DeepSeek 模型...');

    const { error } = await supabase
      .from('ai_provider_key_models')
      .delete()
      .in('id', otherModels.map(m => m.id));

    if (error) {
      console.log('❌ 删除失败:', error.message);
      return;
    }

    console.log(`✓ 已删除 ${otherModels.length} 个非 DeepSeek 模型`);
  } else {
    console.log('  - 没有需要删除的模型');
  }

  console.log('\n✓ 清理完成！');
  console.log(`最终状态: ds 渠道保留 ${deepseekModels.length} 个 DeepSeek 模型`);
}

cleanupDsChannel()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('错误:', err);
    process.exit(1);
  });
