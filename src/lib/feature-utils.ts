import type { AiFeatureItem } from "@/app/(app)/admin/ai-channels/components/types";

export function buildFeatureGroups(features: AiFeatureItem[]) {
  const groups: Record<string, AiFeatureItem[]> = {
    general: [],
    writing: [],
    vision: [],
    system: []
  };

  features.forEach(feature => {
    const groupId = feature.id.split('_')[0] || 'general';
    if (!groups[groupId]) groups[groupId] = [];
    groups[groupId].push(feature);
  });

  return Object.entries(groups)
    .filter(([_, items]) => items.length > 0)
    .map(([id, items]) => ({ id, title: id, items }));
}
