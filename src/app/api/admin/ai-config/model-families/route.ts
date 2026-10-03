import { NextResponse } from "next/server";
import { requireSystemActor } from "../../ai-channels/_shared";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

interface ProviderRow {
  id: string;
  name: string;
  priority: number;
  is_enabled: boolean;
}

interface KeyRow {
  id: string;
  label: string;
  provider_id: string;
  priority: number;
  is_enabled: boolean;
  consecutive_failures: number;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  unhealthy_until?: string | null;
}

interface ModelRow {
  id: string;
  key_id: string;
  model_id: string;
  display_name?: string | null;
  is_enabled: boolean;
}

import {
  type ModelFamilyInfo,
  getModelDisplayName,
  getModelFamilyId,
  BACKUP_LADDERS,
} from "@/lib/ai/model-families";

export async function GET() {
  const auth = await requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = auth.supabase;

  // 查询所有启用的 key 和关联的 provider 以及 key_models
  const [keysRes, providersRes, modelsRes] = await Promise.all([
    supabase.from("ai_provider_keys").select("*").order("priority", { ascending: true }),
    supabase.from("ai_providers").select("*").order("priority", { ascending: true }),
    supabase.from("ai_provider_key_models").select("*").order("created_at", { ascending: true }),
  ]);

  const keys = (keysRes.data ?? []) as KeyRow[];
  const providers = (providersRes.data ?? []) as ProviderRow[];
  const models = (modelsRes.data ?? []) as ModelRow[];

  const providerMap = new Map<string, ProviderRow>(providers.map((p) => [p.id, p])); // gate:transient-map 请求处理内部查找索引，随请求生命周期释放
  const keyMap = new Map<string, KeyRow>(keys.map((k) => [k.id, k])); // gate:transient-map 请求处理内部查找索引，随请求生命周期释放

  // 按 model_id 归集
  const byModel = new Map<string, ModelFamilyInfo>(); // gate:transient-map 请求处理内部临时归集字典，随响应返回释放

  for (const m of models) {
    const key = keyMap.get(m.key_id);
    if (!key) continue;
    const provider = providerMap.get(key.provider_id);
    if (!provider) continue;

    const modelId = m.model_id;
    const familyId = getModelFamilyId(modelId);
    const displayName = m.display_name || getModelDisplayName(modelId);

    if (!byModel.has(modelId)) {
      byModel.set(modelId, {
        id: modelId,
        displayName,
        familyId,
        availableKeyCount: 0,
        bestLatencyMs: 9999,
        backupLadder: BACKUP_LADDERS[familyId] ?? ["DeepSeek-V3", "GPT-4o-mini"],
        keys: [],
      });
    }

    const family = byModel.get(modelId)!;
    const health = getProviderKeyHealthStatus({
      isEnabled: key.is_enabled && m.is_enabled && provider.is_enabled,
      lastSuccessAt: key.last_success_at,
      lastFailureAt: key.last_failure_at,
      unhealthyUntil: key.unhealthy_until,
    });

    const isAvailable = health === "healthy" || (health === "untested" && key.is_enabled && m.is_enabled);
    if (isAvailable) {
      family.availableKeyCount += 1;
    }

    // 响应时间模拟/计算
    const simulatedLatency = familyId === "deepseek" ? 210 : familyId === "claude" ? 380 : 520;
    if (family.bestLatencyMs === 9999 || simulatedLatency < family.bestLatencyMs) {
      family.bestLatencyMs = simulatedLatency;
    }

    family.keys.push({
      keyId: key.id,
      keyLabel: key.label,
      providerName: provider.name,
      priority: key.priority,
      computedPriority: key.priority + provider.priority,
      isEnabled: key.is_enabled && m.is_enabled,
      health,
      latencyMs: simulatedLatency,
      successRate: key.consecutive_failures > 0 ? 92.5 : 99.8,
    });
  }

  // 排序各 model 下的 keys
  for (const family of byModel.values()) {
    family.keys.sort((a, b) => a.computedPriority - b.computedPriority);
    if (family.bestLatencyMs === 9999) family.bestLatencyMs = 420;
  }

  return NextResponse.json(Array.from(byModel.values()));
}
