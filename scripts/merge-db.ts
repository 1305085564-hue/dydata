import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMerge() {
  console.log("Starting DB merge & deduplication...");

  // 1. 获取所有 providers
  const { data: providers, error: pError } = await supabase
    .from("ai_providers")
    .select("*");

  if (pError || !providers) {
    console.error("Failed to fetch providers:", pError?.message);
    process.exit(1);
  }

  const findProviderByName = (name: string) => providers.find(p => p.name === name);

  // 2. 保证 api7 存在
  let api7 = findProviderByName("api7");
  if (!api7) {
    console.log("api7 provider does not exist, creating it...");
    const { data: newApi7, error: createErr } = await supabase
      .from("ai_providers")
      .insert({
        name: "api7",
        base_url: "https://www.aiapikey.net",
        priority: 1
      })
      .select()
      .single();
    if (createErr || !newApi7) {
      console.error("Failed to create api7:", createErr?.message);
      process.exit(1);
    }
    api7 = newApi7;
  }

  // 3. 保证 api1 存在
  let api1 = findProviderByName("api1");
  if (!api1) {
    console.log("api1 provider does not exist, creating it...");
    const { data: newApi1, error: createErr } = await supabase
      .from("ai_providers")
      .insert({
        name: "api1",
        base_url: "https://ai.ltcraft.cn",
        priority: 2
      })
      .select()
      .single();
    if (createErr || !newApi1) {
      console.error("Failed to create api1:", createErr?.message);
      process.exit(1);
    }
    api1 = newApi1;
  }

  // 4. 获取所有 keys
  const { data: keys, error: kError } = await supabase
    .from("ai_provider_keys")
    .select("*");

  if (kError || !keys) {
    console.error("Failed to fetch keys:", kError?.message);
    process.exit(1);
  }

  console.log(`Found ${providers.length} providers and ${keys.length} keys.`);

  // 5. 合并 api7 渠道
  const api7Gemin = findProviderByName("api7-gemin");
  const api7Claude = findProviderByName("api7-claude");

  if (api7Gemin) {
    const geminKeys = keys.filter(k => k.provider_id === api7Gemin.id);
    for (const key of geminKeys) {
      console.log(`Moving api7-gemin key "${key.label}" -> api7 "gemin"...`);
      const { error } = await supabase
        .from("ai_provider_keys")
        .update({
          provider_id: api7.id,
          label: "gemin"
        })
        .eq("id", key.id);
      if (error) console.error(`Error moving key ${key.id}:`, error.message);
    }
  }

  if (api7Claude) {
    const claudeKeys = keys.filter(k => k.provider_id === api7Claude.id);
    for (const key of claudeKeys) {
      console.log(`Moving api7-claude key "${key.label}" -> api7 "claude"...`);
      const { error } = await supabase
        .from("ai_provider_keys")
        .update({
          provider_id: api7.id,
          label: "claude"
        })
        .eq("id", key.id);
      if (error) console.error(`Error moving key ${key.id}:`, error.message);
    }
  }

  // 重命名 api7 自身原本的 default key
  const api7DefaultKey = keys.find(k => k.provider_id === api7!.id && k.label === "api7-default");
  if (api7DefaultKey) {
    console.log(`Renaming api7 default key "api7-default" -> "default"...`);
    await supabase
      .from("ai_provider_keys")
      .update({ label: "default" })
      .eq("id", api7DefaultKey.id);
  }

  // 6. 合并 api1 渠道
  const api1Claude = findProviderByName("api1 claude");
  if (api1Claude) {
    const api1ClaudeKeys = keys.filter(k => k.provider_id === api1Claude.id);
    for (const key of api1ClaudeKeys) {
      console.log(`Moving api1 claude key "${key.label}" -> api1 "claude"...`);
      const { error } = await supabase
        .from("ai_provider_keys")
        .update({
          provider_id: api1!.id,
          label: "claude"
        })
        .eq("id", key.id);
      if (error) console.error(`Error moving key ${key.id}:`, error.message);
    }
  }

  // 重命名 api1 自身原本的 default key
  const api1DefaultKey = keys.find(k => k.provider_id === api1!.id && k.label === "api1-default");
  if (api1DefaultKey) {
    console.log(`Renaming api1 default key "api1-default" -> "default"...`);
    await supabase
      .from("ai_provider_keys")
      .update({ label: "default" })
      .eq("id", api1DefaultKey.id);
  }

  // 7. 去除其他 keys 的 default 后缀
  const otherDefaultKeys = keys.filter(k => k.label.endsWith("-default") && k.provider_id !== api7!.id && k.provider_id !== api1!.id);
  for (const key of otherDefaultKeys) {
    console.log(`Cleaning suffix for key "${key.label}" -> "default"...`);
    await supabase
      .from("ai_provider_keys")
      .update({ label: "default" })
      .eq("id", key.id);
  }

  // 8. 清理冗余的 providers
  const redundantNames = ["api7-gemin", "api7-claude", "api1 claude"];
  for (const name of redundantNames) {
    const prov = findProviderByName(name);
    if (prov) {
      console.log(`Deleting redundant provider "${name}"...`);
      const { error } = await supabase
        .from("ai_providers")
        .delete()
        .eq("id", prov.id);
      if (error) {
        console.error(`Failed to delete provider "${name}":`, error.message);
      }
    }
  }

  console.log("DB merge and deduplication successfully completed!");
}

runMerge().catch(console.error);
