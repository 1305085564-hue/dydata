import { listRankedProviderKeyModels, markProviderKeyModelSuccess, markProviderKeySuccess } from "@/lib/ai/provider-routing";
import { CLAIRIC_CANONICAL_MODEL_ID } from "@/lib/ai/provider-protocols";
import { probeAiFeature } from "@/lib/ai/client";
import { probeClairicOcr } from "@/lib/clairic-ocr";
import { toCanonicalModelId } from "./canonical-model";
import { loadAiConfig, type AiConfigClient } from "./config-loader";
import { describeChannelFailure } from "./failure-diagnostic";
import {
  buildProbeRequestBody,
  clearLegacyManualSleep,
  isValidVisionProbeContent,
  MODEL_PROBE_TIMEOUT_MS,
} from "./model-tests";

export async function testOcrScreenshotFeature(
  supabase: AiConfigClient,
  deps: { probeAiFeature?: typeof probeAiFeature; probeClairicOcr?: typeof probeClairicOcr } = {},
) {
  const started = Date.now();
  const { data: bindingRows } = await supabase
    .from("ai_feature_bindings")
    .select("feature_key, model_id");
  const rows = (bindingRows ?? []) as Array<{ feature_key: string; model_id?: string | null }>;
  const ocrModel = rows.find((r) => r.feature_key === "ocr_screenshot")?.model_id;
  const defaultModel = rows.find((r) => r.feature_key === "default")?.model_id;
  const effectiveModelId = ocrModel?.trim()
    ? toCanonicalModelId(ocrModel)
    : defaultModel?.trim()
      ? toCanonicalModelId(defaultModel)
      : null;

  if (effectiveModelId === CLAIRIC_CANONICAL_MODEL_ID) {
    const ranked = await listRankedProviderKeyModels(supabase, CLAIRIC_CANONICAL_MODEL_ID, { includeSleeping: true });
    const ordered = [
      ...ranked.filter((item) => !item.config.cooldownUntil),
      ...ranked.filter((item) => item.config.cooldownUntil),
    ];
    if (ordered.length === 0) {
      const message = "未配置可用的 Cloudflare Clairic 渠道";
      return {
        testResult: {
          ok: false,
          latencyMs: Date.now() - started,
          model: "@cf/cloudflare/clairic",
          message,
          failureDiagnostic: describeChannelFailure({ message }),
        },
        bundle: await loadAiConfig(supabase),
      };
    }
    const probeClairic = deps.probeClairicOcr ?? probeClairicOcr;
    let lastFail: Awaited<ReturnType<typeof probeClairicOcr>> | null = null;
    for (const { config } of ordered) {
      const probeRes = await probeClairic({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelId: config.modelId,
        channelName: config.providerName,
        channelLabel: config.providerKeyLabel,
        timeoutMs: MODEL_PROBE_TIMEOUT_MS,
      });
      if (probeRes.ok) {
        await markProviderKeySuccess(supabase, config.providerKeyId);
        await clearLegacyManualSleep(supabase, config.providerKeyId);
        await markProviderKeyModelSuccess(supabase, config.providerKeyModelId);
        return {
          testResult: {
            ok: true,
            latencyMs: Date.now() - started,
            model: probeRes.model,
            channelName: probeRes.channelName,
            channelLabel: probeRes.channelLabel,
          },
          bundle: await loadAiConfig(supabase),
        };
      }
      lastFail = probeRes;
    }
    const message = lastFail?.message || "Cloudflare Clairic 试跑失败";
    return {
      testResult: {
        ok: false,
        latencyMs: Date.now() - started,
        model: lastFail?.model ?? "@cf/cloudflare/clairic",
        channelName: lastFail?.channelName,
        channelLabel: lastFail?.channelLabel,
        message,
        failureDiagnostic:
          lastFail?.failureDiagnostic ??
          describeChannelFailure({ message, status: lastFail?.status }),
      },
      bundle: await loadAiConfig(supabase),
    };
  }

  let result: Awaited<ReturnType<typeof probeAiFeature>> | null = null;
  let message = "截图识别试跑失败";
  try {
    const sample = buildProbeRequestBody("", "vision");
    result = await (deps.probeAiFeature ?? probeAiFeature)("ocr_screenshot", {
      messages: sample.messages,
      jsonMode: true,
      maxTokens: 64,
      timeoutMs: MODEL_PROBE_TIMEOUT_MS,
      totalTimeoutMs: 30_000,
      validateContent: isValidVisionProbeContent,
    });
    if (result.providerKeyId) {
      await markProviderKeySuccess(supabase, result.providerKeyId);
      await clearLegacyManualSleep(supabase, result.providerKeyId);
      if (result.providerKeyModelId) await markProviderKeyModelSuccess(supabase, result.providerKeyModelId);
    }
  } catch (error) {
    if (error instanceof Error) message = error.message;
  }
  const bundle = await loadAiConfig(supabase);
  return {
    bundle,
    testResult: result
      ? {
          ok: true,
          latencyMs: Date.now() - started,
          model: result.model,
          channelName: result.channelName,
          channelLabel: bundle.keys.find((key) => key.id === result?.providerKeyId)?.label ?? result.channelName,
        }
      : { ok: false, latencyMs: Date.now() - started, message, failureDiagnostic: describeChannelFailure({ message }) },
  };
}
