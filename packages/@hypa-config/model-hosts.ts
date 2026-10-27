import { MODELS_BY_CAPABILITY } from "@hypa/config/models";

type ModelHost = "meta-api" | "vertex" | "hf-router" | "runpod";

type ModelEntry = { name: string; baseApiUrl?: string };

function entries(type: string, provider: string): ModelEntry[] {
  const groups = MODELS_BY_CAPABILITY as unknown as Record<
    string,
    Record<string, ModelEntry[] | undefined> | undefined
  >;
  return groups[type]?.[provider] ?? [];
}

export function modelHost(
  type: string,
  provider: string,
  model?: string | null,
): ModelHost | null {
  if (!model) return null;
  const url = entries(type, provider).find((item) => item.name === model)?.baseApiUrl ?? "";
  if (url.includes("api.meta.ai")) return "meta-api";
  if (url.includes("aiplatform.googleapis.com")) return "vertex";
  if (url.includes("router.huggingface.co")) return "hf-router";
  if (url.includes("api.runpod.ai")) return "runpod";
  return null;
}
