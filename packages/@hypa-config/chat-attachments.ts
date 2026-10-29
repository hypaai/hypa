export const CHAT_FILE_LIMIT = 4;
export const CHAT_FILE_BYTES = 5 * 1024 * 1024;
export const CHAT_TOTAL_FILE_BYTES = 7 * 1024 * 1024;
export const CHAT_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const CHAT_AUDIO_MIMES = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
] as const;
export const CHAT_FILE_MIMES: readonly string[] = [
  ...CHAT_IMAGE_MIMES,
  ...CHAT_AUDIO_MIMES,
];

export interface ChatFileInput {
  data: string;
  mime: string;
  name: string;
}

export function chatFileMime(name: string, type: string): string | undefined {
  const mime = type.split(";")[0].toLowerCase();
  const aliases: Record<string, string> = {
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-m4a": "audio/mp4",
    "audio/x-flac": "audio/flac",
  };
  if (CHAT_FILE_MIMES.includes(aliases[mime] ?? mime))
    return aliases[mime] ?? mime;
  if (mime && mime !== "application/octet-stream") return undefined;
  const extensions: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
    webm: "audio/webm",
  };
  return extensions[name.split(".").at(-1)?.toLowerCase() ?? ""];
}
