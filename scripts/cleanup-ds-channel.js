// 在浏览器控制台执行此脚本，清理 ds 渠道的脏数据

// 步骤 1：先分析问题（只读，安全）
async function analyzeChannel() {
  const response = await fetch('/api/admin/ai-config/cleanup-channel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      keyId: 'ds',  // 从截图可以看到渠道 ID 是 ds
      dryRun: true
    })
  });

  const result = await response.json();
  console.log('=== 分析结果 ===');
  console.log('渠道名称:', result.keyLabel);
  console.log('总模型数:', result.totalModels);
  console.log('应保留:', result.belongToChannel, '个');
  console.log('应删除:', result.notBelong, '个');
  console.log('\n将删除以下模型:');
  result.toDelete.forEach(m => {
    console.log('  -', m.modelId, '|', m.displayName);
  });

  return result;
}

// 步骤 2：执行清理（危险操作）
async function cleanupChannel() {
  const response = await fetch('/api/admin/ai-config/cleanup-channel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      keyId: 'ds',
      dryRun: false
    })
  });

  const result = await response.json();
  console.log('=== 清理完成 ===');
  console.log('已删除:', result.deleted, '个模型');
  console.log('剩余:', result.remaining, '个模型');

  return result;
}

// 使用方法：
console.log('请按顺序执行：');
console.log('1. 先分析: await analyzeChannel()');
console.log('2. 确认后清理: await cleanupChannel()');
console.log('3. 刷新页面验证');
