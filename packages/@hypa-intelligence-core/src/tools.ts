import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  PRODUCT_MODEL_OPTIONS_BY_CAPABILITY,
  PRODUCT_MODELS_BY_CAPABILITY,
  type ModelCapability,
} from "@hypa/config/models";
import { supportsMtPair } from "@hypa/config/mt-pair-support";
import { canonicalLanguage, LANGUAGES, resolveLanguage } from "./catalog.ts";

export const AUTO_CAPABILITIES: ReadonlySet<ModelCapability> = new Set(["MT", "TTS", "ASR"]);
const OCR_PROVIDERS = new Set(["openai", "meta"]);

export function toolModelChoices(capability: ModelCapability): string[] {
  return Object.entries(PRODUCT_MODELS_BY_CAPABILITY[capability])
    .filter(([provider]) => capability !== "OCR" || OCR_PROVIDERS.has(provider))
    .flatMap(([provider, models]) => models.map((model) => `${provider}/${model.name}`));
}

const MODEL_HELP =
  'Optional. Omit or "auto" for the best-scoring model for the language (with fallback), "default" for the catalog default, or a "provider/model" id from list_models.';

const modelField = (step?: string) =>
  z
    .string()
    .max(200)
    .optional()
    .describe(step ? `${MODEL_HELP} Applies to the ${step} step.` : MODEL_HELP);

export interface RanOn {
  provider?: string;
  model?: string;
}

export interface HypaExecutor {
  translate(input: {
    text: string;
    targetLang: string;
    sourceLang?: string;
    model?: string;
  }): Promise<{ translation: string; language: string | null } & RanOn>;
  speak(input: {
    text: string;
    language: string;
    voice?: string;
    model?: string;
  }): Promise<{ audioBase64: string; mime: string; sampleRate?: number; voice?: string } & RanOn>;
  transcribe(input: {
    audio: string;
    audioType?: "base64" | "url";
    sourceLang?: string;
    model?: string;
  }): Promise<{ transcript: string } & RanOn>;
  lookUp(input: { word: string; language?: string }): Promise<{ result: Record<string, unknown> } & RanOn>;
  readImage(input: {
    image: string;
    imageType?: "base64" | "url";
    model?: string;
  }): Promise<{ text: string } & RanOn>;
  wordOfTheDay(): Promise<WordOfTheDay | null>;
}

export interface WordOfTheDay {
  word: string;
  meaning: string;
  language: string;
  voice: string;
  audioUrl?: string;
}

const language = (hint: string) =>
  z
    .string()
    .min(1)
    .max(40)
    .describe(
      `${hint} A Hypa language label, e.g. "English", "Yoruba", "Hausa", "Igbo", "French". Check list_languages when unsure.`,
    );

const text = (max: number, hint: string) => z.string().min(1).max(max).describe(hint);

const audio = z
  .string()
  .min(1)
  .max(20_000_000)
  .describe("Base64-encoded audio, or an https URL when audioType is 'url'.");

const image = z
  .string()
  .min(1)
  .max(25_000_000)
  .describe("Base64-encoded image, or an https URL when imageType is 'url'. PNG, JPG or WebP.");

const mediaType = (what: string) =>
  z.enum(["base64", "url"]).optional().describe(`How \`${what}\` is given. Defaults to base64.`);

const voice = z
  .string()
  .max(80)
  .optional()
  .describe("Optional voice name for the language. Omit for the model's default voice.");

const ranOn = {
  provider: z.string().optional().describe("Provider that ran the model step."),
  model: z.string().optional().describe("Model that ran (the Auto winner when routed)."),
};

const audioFormat = z
  .enum(["url", "base64"])
  .optional()
  .describe(
    'How the audio comes back. "url" (default): a link to the audio that works for about an hour. "base64": the audio inline, which is very large.',
  );

const speech = {
  audioUrl: z.string().optional().describe("Link to the audio, valid for about an hour."),
  audioBase64: z.string().optional().describe('Base64-encoded audio (only with format "base64").'),
  sampleRate: z.number().optional().describe("Audio sample rate in Hz."),
  voice: z.string().optional().describe("The voice that spoke."),
  mime: z.string().describe("Audio MIME type, such as audio/wav or audio/mpeg."),
};

export interface HypaTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.AnyZodObject;
  outputSchema: z.AnyZodObject;
  run: (executor: HypaExecutor, args: Record<string, any>) => Promise<object>;
}

const DOCUMENT_MAX = 20_000;
const CHUNK_MAX = 5_000;

const lang = (value?: string) => (value ? canonicalLanguage(value) : undefined);
const voiceName = (value?: string) => (value && value.toLowerCase() !== "auto" ? value : undefined);

export const HYPA_TOOLS: HypaTool[] = [
  {
    name: "translate_message",
    title: "Translate a message",
    description:
      "Translate text into another language. Keep numbers, doses and prices exactly as written.",
    inputSchema: z.object({
      text: text(5000, "The text to translate."),
      sourceLang: language("The language of the text. Omit to auto-detect.").optional(),
      targetLang: language("The language to translate into."),
      model: modelField(),
    }),
    outputSchema: z.object({
      translation: z.string(),
      language: z.string().nullable().describe("The detected source language, when auto-detected."),
      ...ranOn,
    }),
    run: (executor, args) =>
      executor.translate({
        text: args.text,
        sourceLang: lang(args.sourceLang),
        targetLang: canonicalLanguage(args.targetLang),
        model: args.model,
      }),
  },
  {
    name: "translate_document",
    title: "Translate a long document",
    description:
      "Translate a long text (up to 20,000 characters) in chunks, keeping its paragraphs. Use translate_message for anything under 5,000 characters.",
    inputSchema: z.object({
      text: text(DOCUMENT_MAX, "The document to translate."),
      sourceLang: language("The language of the document. Omit to auto-detect.").optional(),
      targetLang: language("The language to translate into."),
      model: modelField(),
    }),
    outputSchema: z.object({
      translation: z.string(),
      language: z.string().nullable().describe("The detected source language, when auto-detected."),
      chunks: z.number().describe("How many pieces the document was translated in."),
      ...ranOn,
    }),
    run: async (executor, args) => {
      const sourceLang = lang(args.sourceLang);
      const targetLang = canonicalLanguage(args.targetLang);
      const chunks = documentChunks(args.text);
      const done = await Promise.all(
        chunks.map((chunk) =>
          executor.translate({ text: chunk.trim(), sourceLang, targetLang, model: args.model }),
        ),
      );
      const translation = done
        .map((part, index) => part.translation.trim() + (chunks[index].match(/\s*$/)?.[0] ?? ""))
        .join("")
        .trimEnd();
      const sameModel = done.every((part) => part.provider === done[0].provider && part.model === done[0].model);
      return {
        translation,
        language: done[0].language,
        chunks: chunks.length,
        ...(sameModel ? ranOnOf(done[0]) : {}),
      };
    },
  },
  {
    name: "translate_and_speak",
    title: "Translate and speak aloud",
    description: "Translate text and speak the translation.",
    inputSchema: z.object({
      text: text(5000, "The text to translate and speak."),
      sourceLang: language("The language of the text. Omit to auto-detect.").optional(),
      targetLang: language("The language to translate into and speak."),
      voice,
      format: audioFormat,
      model: modelField("translation"),
      speechModel: modelField("speech"),
    }),
    outputSchema: z.object({ translatedText: z.string(), ...speech, ...ranOn }),
    run: async (executor, args) => {
      const targetLang = canonicalLanguage(args.targetLang);
      const translated = await executor.translate({
        text: args.text,
        sourceLang: lang(args.sourceLang),
        targetLang,
        model: args.model,
      });
      const spoken = await executor.speak({
        text: translated.translation,
        language: targetLang,
        voice: voiceName(args.voice),
        model: args.speechModel,
      });
      return { translatedText: translated.translation, ...spoken };
    },
  },
  {
    name: "look_up_term",
    title: "Look up a word",
    description: "Look up a word or short phrase: meanings, usage, similar and opposite words, and cultural context.",
    inputSchema: z.object({
      word: text(120, "The word or phrase to look up."),
      language: language("The language of the word. Omit for English.").optional(),
    }),
    outputSchema: z.object({ result: z.record(z.unknown()), ...ranOn }),
    run: (executor, args) => executor.lookUp({ word: args.word, language: lang(args.language) }),
  },
  {
    name: "text_to_speech",
    title: "Speak text aloud",
    description:
      "Speak text aloud in its language (audio), without translating it. " +
      "To use speech in code, call POST https://api.hypaintelligence.com/v2/developer/tts with the key in an `x-api-key` header " +
      "(not `Authorization: Bearer`) and JSON `{provider, model, voice, text, language}`, using the provider, model and voice this tool returns. " +
      "The reply is JSON: `response.audio_b64` is the audio (base64) and `response.audio_type` its type.",
    inputSchema: z.object({
      text: text(5000, "The text to speak."),
      language: language("The language of the text, which is the language it is spoken in."),
      voice,
      format: audioFormat,
      model: modelField(),
    }),
    outputSchema: z.object({ ...speech, ...ranOn }),
    run: async (executor, args) =>
      executor.speak({
        text: args.text,
        language: canonicalLanguage(args.language),
        voice: voiceName(args.voice),
        model: args.model,
      }),
  },
  {
    name: "speech_to_text",
    title: "Transcribe speech",
    description: "Transcribe a voice recording into text.",
    inputSchema: z.object({
      audio,
      audioType: mediaType("audio"),
      sourceLang: language("The language spoken, when known. Helps pick the best model.").optional(),
      model: modelField(),
    }),
    outputSchema: z.object({ transcript: z.string(), ...ranOn }),
    run: (executor, args) =>
      executor.transcribe({
        audio: args.audio,
        audioType: args.audioType,
        sourceLang: lang(args.sourceLang),
        model: args.model,
      }),
  },
  {
    name: "process_voice_message",
    title: "Process a voice message",
    description: "Transcribe a voice message, and translate the transcript when targetLang is given.",
    inputSchema: z.object({
      audio,
      audioType: mediaType("audio"),
      sourceLang: language("The language spoken. Omit to auto-detect.").optional(),
      targetLang: language("Optionally translate the transcript into this language.").optional(),
      model: modelField("transcription"),
      translationModel: modelField("translation"),
    }),
    outputSchema: z.object({ transcript: z.string(), translatedText: z.string().optional(), ...ranOn }),
    run: async (executor, args) => {
      const sourceLang = lang(args.sourceLang);
      const heard = await executor.transcribe({
        audio: args.audio,
        audioType: args.audioType,
        sourceLang,
        model: args.model,
      });
      const targetLang = lang(args.targetLang);
      if (!targetLang) return heard;
      const translated = await executor.translate({
        text: heard.transcript,
        sourceLang,
        targetLang,
        model: args.translationModel,
      });
      return { transcript: heard.transcript, translatedText: translated.translation, ...ranOnOf(translated) };
    },
  },
  {
    name: "extract_text_from_image",
    title: "Read text from an image",
    description: "Read the text in an image (a sign, menu, label, document or screenshot).",
    inputSchema: z.object({ image, imageType: mediaType("image"), model: modelField() }),
    outputSchema: z.object({ text: z.string(), ...ranOn }),
    run: (executor, args) =>
      executor.readImage({ image: args.image, imageType: args.imageType, model: args.model }),
  },
  {
    name: "translate_image",
    title: "Read and translate an image",
    description: "Read the text in an image, then translate it into another language.",
    inputSchema: z.object({
      image,
      imageType: mediaType("image"),
      sourceLang: language("The language of the text in the image. Omit to auto-detect.").optional(),
      targetLang: language("The language to translate into."),
      model: modelField("reading"),
      translationModel: modelField("translation"),
    }),
    outputSchema: z.object({
      text: z.string(),
      translation: z.string(),
      language: z.string().nullable(),
      ...ranOn,
    }),
    run: async (executor, args) => {
      const read = await executor.readImage({
        image: args.image,
        imageType: args.imageType,
        model: args.model,
      });
      const translated = await executor.translate({
        text: read.text,
        sourceLang: lang(args.sourceLang),
        targetLang: canonicalLanguage(args.targetLang),
        model: args.translationModel,
      });
      return {
        text: read.text,
        translation: translated.translation,
        language: translated.language,
        ...ranOnOf(translated),
      };
    },
  },
  {
    name: "list_voices",
    title: "List voices for a language",
    description:
      "List the voices Hypa has for one language, and the models that can speak it. Use it to pick a valid `voice` for text_to_speech.",
    inputSchema: z.object({
      language: language("The language to list voices for."),
    }),
    outputSchema: z.object({
      language: z.string().optional().describe("Canonical language label."),
      code: z.string().optional().describe("Language code."),
      voices: z.array(z.string()).describe("Voice names to pass as `voice`."),
      models: z.array(z.string()).describe("provider/model ids that can speak this language."),
      unknown: z.boolean().optional().describe("True when Hypa does not know this language."),
    }),
    run: async (_executor, args) => {
      const target = resolveLanguage(args.language);
      if (!target) return { voices: [], models: [], unknown: true };
      const models = Object.entries(PRODUCT_MODEL_OPTIONS_BY_CAPABILITY.TTS).flatMap(([provider, options]) =>
        options
          .filter((option) => option.languageCodes.includes(target.code))
          .map((option) => `${provider}/${option.name}`),
      );
      return { language: target.name, code: target.code, voices: [...target.voices], models };
    },
  },
  {
    name: "word_of_the_day",
    title: "Word of the day",
    description:
      "Today's word in one of Hypa's languages, with its meaning and a recording when there is one. The same word for everyone, and it changes daily.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      available: z.boolean().describe("False before today's word has been made."),
      word: z.string().optional(),
      meaning: z.string().optional(),
      language: z.string().optional(),
      voice: z.string().optional(),
      audioUrl: z.string().optional().describe("Link to a recording of the word."),
    }),
    run: async (executor) => {
      const entry = await executor.wordOfTheDay();
      return entry ? { available: true, ...entry } : { available: false };
    },
  },
  {
    name: "list_languages",
    title: "List languages",
    description: "List every language Hypa supports for translation and speech, with its voices.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      languages: z.array(z.object({ name: z.string(), code: z.string(), voices: z.array(z.string()) })),
    }),
    run: async () => ({
      languages: LANGUAGES.map(({ name, code, voices }) => ({ name, code, voices: [...voices] })),
    }),
  },
  {
    name: "check_language_pair",
    title: "Check a language pair",
    description:
      "Check whether Hypa can translate from one language to another, and which models can. Use it before translating an unusual pair.",
    inputSchema: z.object({
      sourceLang: language("The language to translate from. Omit for auto-detect.").optional(),
      targetLang: language("The language to translate into."),
    }),
    outputSchema: z.object({
      supported: z.boolean(),
      models: z.array(z.string()).describe("provider/model ids that can translate this pair."),
      unknown: z.array(z.string()).optional().describe("Language labels Hypa doesn't know."),
    }),
    run: async (_executor, args) => {
      const source = args.sourceLang ? resolveLanguage(args.sourceLang) : undefined;
      const target = resolveLanguage(args.targetLang);
      const unknown = [args.sourceLang && !source ? args.sourceLang : "", target ? "" : args.targetLang].filter(Boolean);
      if (unknown.length || !target) return { supported: false, models: [], unknown };
      const runnable = new Set(toolModelChoices("MT"));
      const models = Object.entries(PRODUCT_MODEL_OPTIONS_BY_CAPABILITY.MT).flatMap(([provider, options]) =>
        options
          .filter(
            (option) =>
              option.languageCodes.includes(target.code) &&
              (!source || option.languageCodes.includes(source.code)) &&
              supportsMtPair(provider, source?.name ?? null, target.name),
          )
          .map((option) => `${provider}/${option.name}`)
          .filter((id) => runnable.has(id)),
      );
      return { supported: models.length > 0, models };
    },
  },
  {
    name: "list_models",
    title: "List models",
    description:
      'List the models each kind of tool can run on, for the optional `model` argument. "auto" picks by quality score; "default" uses the catalog default.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      auto: z.array(z.string()).describe("Capabilities that support Auto."),
      models: z.record(z.array(z.string())).describe("provider/model ids per capability."),
    }),
    run: async () => ({
      auto: [...AUTO_CAPABILITIES],
      models: {
        translation: toolModelChoices("MT"),
        speech: toolModelChoices("TTS"),
        transcription: toolModelChoices("ASR"),
        image_reading: toolModelChoices("OCR"),
      },
    }),
  },
];

function documentChunks(text: string): string[] {
  const pieces = text
    .split(/(?<=\n\s*\n)/)
    .flatMap((paragraph) =>
      paragraph.length <= CHUNK_MAX ? [paragraph] : (paragraph.match(/[^.!?。]+[.!?。]*\s*/g) ?? [paragraph]),
    )
    .flatMap((piece) => {
      const parts: string[] = [];
      for (let start = 0; start < piece.length; start += CHUNK_MAX) parts.push(piece.slice(start, start + CHUNK_MAX));
      return parts;
    });
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks.length - 1;
    if (last >= 0 && chunks[last].length + piece.length <= CHUNK_MAX) chunks[last] += piece;
    else chunks.push(piece);
  }
  return chunks.filter((chunk) => chunk.trim());
}

const ranOnOf = ({ provider, model }: RanOn): RanOn => ({
  ...(provider ? { provider } : {}),
  ...(model ? { model } : {}),
});

export async function runHypaTool(
  tool: HypaTool,
  executor: HypaExecutor,
  args: unknown,
): Promise<Record<string, unknown>> {
  return (await tool.run(executor, tool.inputSchema.parse(args ?? {}))) as Record<string, unknown>;
}

export interface FunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function toFunctionTools(tools: HypaTool[] = HYPA_TOOLS): FunctionTool[] {
  return tools.map((tool) => {
    const { $schema: _schema, ...parameters } = zodToJsonSchema(tool.inputSchema, {
      $refStrategy: "none",
    }) as Record<string, unknown>;
    return {
      type: "function",
      function: { name: tool.name, description: tool.description, parameters },
    };
  });
}
