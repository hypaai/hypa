import { modelHost } from "@hypa/config/model-hosts";

type GoogleModelType = "AC" | "MT" | "TTS" | "ASR";

export function isVertexGoogleModel(
  type: GoogleModelType,
  model?: string | null,
): boolean {
  return modelHost(type, "google", model) === "vertex";
}
