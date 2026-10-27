import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DictionaryService } from './dictionary.service';
import { HypaAiAiService } from 'src/ai/hypaai.ai.service';
import { DeveloperSharedService } from 'src/api/developer/providers/shared.service';
import { AudioStorageService } from 'src/libs/shared/audio-storage.service';
import { LEGACY_MODELS_BY_CAPABILITY as models } from '@hypa/config/legacy-models';
import { getLabPrompt, renderPrompt } from '@hypa/config/prompts';

const WORD_OF_THE_DAY_CACHE_KEY = 'word_of_the_day';
const WORD_OF_THE_DAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface WordOfTheDayEntry {
  word: string;
  meaning: string;
  language: string;
  voice: string;
  audioUrl?: string;
}

@Injectable()
export class WordOfTheDayService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly hypaAiService: HypaAiAiService,
    private readonly audioStorage: AudioStorageService,
    private readonly dictionaryService: DictionaryService,
    private readonly shared: DeveloperSharedService,
  ) {}

  async getWordOfTheDay(): Promise<WordOfTheDayEntry | null> {
    const cached = await this.cacheManager.get<WordOfTheDayEntry>(
      WORD_OF_THE_DAY_CACHE_KEY,
    );
    return cached ?? null;
  }

  async runWordOfTheDay(): Promise<WordOfTheDayEntry> {
    const defaultTts =
      models.TTS.hypaai.find((m) => m.default) ?? models.TTS.hypaai[0];
    const modelName = 'Hypa-Llama3.1-8b-SFT';
    const llmModel = models.AC.hypaai.find((m) => m.name == modelName);
    const voicesByLang = defaultTts?.voices as Record<string, string[]>;
    const languageKeys = Object.keys(voicesByLang ?? {});
    if (languageKeys.length === 0) {
      throw new Error('Word of the day: no TTS languages configured');
    }
    const selectedLanguage = llmModel?.languages
      ? llmModel?.languages[
          Math.floor(Math.random() * llmModel.languages.length)
        ]
      : 'English';
    const voices = voicesByLang[selectedLanguage.toLowerCase()];
    const voice = voices?.[0] ?? 'Eniola';

    if (!llmModel?.base_apiURL) {
      throw new Error('Word of the day: no LLM endpoint configured');
    }

    const raw = await this.hypaAiService.chatSync(
      [
        {
          role: 'system',
          content: renderPrompt(getLabPrompt('wordOfTheDay', 'system') ?? '', {
            selectedLanguage,
          }),
        },
        {
          role: 'user',
          content: renderPrompt(getLabPrompt('wordOfTheDay', 'user') ?? '', {
            selectedLanguage,
          }),
        },
      ],
      llmModel.base_apiURL,
      { ...this.shared.resolveHypaAiUpstream(llmModel) },
    );
    console.log('+'.repeat(100));
    console.log(raw.content);
    console.log('+'.repeat(100));
    if (!raw.content.trim()) {
      throw new Error('Word of the day: empty content returned from LLM');
    }

    const ex = this.dictionaryService.extractRawFromDict(raw.content);
    const word = ex.word?.trim();

    if (!word) {
      throw new Error('Word of the day: unable to extract word from content');
    }

    const firstDefinition = ex.definitions?.[0];
    if (!firstDefinition?.text?.trim()) {
      throw new Error(
        'Word of the day: unable to extract definition from content',
      );
    }

    const entry: WordOfTheDayEntry = {
      language: selectedLanguage,
      meaning: firstDefinition.text,
      voice,
      word,
    };

    await this.cacheManager.set(
      WORD_OF_THE_DAY_CACHE_KEY,
      entry,
      WORD_OF_THE_DAY_CACHE_TTL_MS,
    );

    const base64 = await this.hypaAiService.tts({
      text: `${word} is ${/^(a|e|i|o|u)/i.test(selectedLanguage) ? 'an' : 'a'} ${selectedLanguage} Word, Meaning: ${entry.meaning}.`,
      voice,
      presets: {
        provider: 'hypaai',
        model: defaultTts?.name ?? 'hypaai-orpheus-v5-pqq',
        temperature: 0.1,
        top_p: 0.95,
        repetition_penalty: 2.0,
        max_tokens: 1024,
      },
    });

    const audioId = this.audioStorage.generateId();
    await this.audioStorage.store(audioId, base64);
    const baseUrl = process.env.BASE_URL ?? '';
    entry.audioUrl = `${baseUrl}/audio/${audioId}`;

    await this.cacheManager.set(
      WORD_OF_THE_DAY_CACHE_KEY,
      entry,
      WORD_OF_THE_DAY_CACHE_TTL_MS,
    );

    return entry;
  }
}
