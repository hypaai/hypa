import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from 'src/libs/db/db.service';
import { GetDictionaryHistoryDto } from './dictionary.dto';
import { Prisma, dictionary_search } from 'src/generated/prisma/client';

interface ExtractedDictionaryDef {
  type?: string;
  text: string;
}

interface ExtractedDictionaryResult {
  word: string;
  definitions?: ExtractedDictionaryDef[];
  usage?: ExtractedDictionaryDef[];
  syms?: string[];
  antm?: string[];
  cultural_context?: ExtractedDictionaryDef[];
  fun_facts?: ExtractedDictionaryDef[];
}

@Injectable()
export class DictionaryService {
  constructor(private readonly db: DbService) {}
  private removeInvalidChars = (text: string) => {
    return text.replace(/[*#]/g, '').trim();
  };

  private extractSimpleList(raw: string): string[] {
    return raw
      .split(/\n?\s*[-•·]\s+/)
      .map((item) => this.removeInvalidChars(item))
      .filter(Boolean);
  }

  extractDescriptiveSection(raw: string): ExtractedDictionaryDef[] {
    const typed = this.extractSection(raw).filter(Boolean);
    if (typed.length) return typed;

    const list = this.extractSimpleList(raw);
    if (list.length) return list.map((text) => ({ text }));

    const text = this.removeInvalidChars(raw.replace(/\n+/g, ' '));
    return text ? [{ text }] : [];
  }

  extractSection(raw: string): ExtractedDictionaryDef[] {
    const def = raw
      .split(/\n?\s*[-•·]\s+/)
      .map((item) => item.trim().replace(/\n/g, ''))
      .filter(Boolean)
      .map((item) => {
        const [type, ...rest] = item.split(':');

        return {
          type: this.removeInvalidChars(type.replace(/\*{1,}|\#{3}/g, '')),
          text: this.removeInvalidChars(
            rest
              .join(':')
              .trim()
              .replace(/\*{1,}/g, '')
              .replace(/(\+\#){1,}/g, '')
              .trim(),
          ),
        };
      })
      .filter((def) => def.type && def.text);
    return def;
  }
  extractRawFromDict(
    raw: string,
    fallbackWord?: string,
  ): ExtractedDictionaryResult {
    let text = raw.trim();
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/([^\n])\s+(#{3,}\s*[^\n#:：]{1,80}[：:])/g, '$1\n$2')
      .replace(/#{3,}\s*\n+\s*/g, '### ');

    const splitHeaderLine = (line: string) => {
      const trimmed = line.trim();

      if (!trimmed || /^[>*\s]*([-*•·]|\d+[.)])\s+/.test(trimmed)) {
        return null;
      }

      const markdownMatch = trimmed.match(/^#{3,}\s*(.+?)\s*$/);
      const candidate = markdownMatch?.[1]?.trim() ?? trimmed;
      const colonMatch = candidate.match(/^(.{1,80}?)[：:]\s*(.*)$/);

      if (!colonMatch) {
        return null;
      }

      return {
        header: this.removeInvalidChars(colonMatch[1]),
        inlineBody: colonMatch[2].trim(),
      };
    };

    const sections: string[] = [];
    const sectionHeaders: (string | null)[] = [];
    let currentSection: string[] | null = null;
    let currentHeader: string | null = null;

    for (const line of text.split('\n')) {
      const headingMatch = splitHeaderLine(line);

      if (headingMatch) {
        if (currentSection) {
          sections.push(currentSection.join('\n').trim());
          sectionHeaders.push(currentHeader);
        }

        currentHeader = headingMatch.header;
        currentSection = headingMatch.inlineBody
          ? [headingMatch.inlineBody]
          : [];
        continue;
      }

      if (!currentSection) {
        currentSection = [];
      }

      currentSection.push(line);
    }

    if (currentSection) {
      sections.push(currentSection.join('\n').trim());
      sectionHeaders.push(currentHeader);
    }

    const keptHeaders = sectionHeaders.filter((_, i) => Boolean(sections[i]));
    const section = sections.filter(Boolean);

    const byName: Record<string, string> = {};
    keptHeaders.forEach((header, index) => {
      const key = header?.trim().toLowerCase();
      if (!key) return;
      const field = /antonym/.test(key)
        ? 'antonyms'
        : /synonym/.test(key)
          ? 'synonyms'
          : /definition/.test(key)
            ? 'definitions'
            : /usage|example/.test(key)
              ? 'usage'
              : /cultural/.test(key)
                ? 'cultural'
                : /fun fact/.test(key)
                  ? 'funFacts'
                  : null;
      if (field && !byName[field]) byName[field] = section[index];
    });

    const useHeaderNames = Object.keys(byName).length >= 2;
    const pick = (field: string, index: number) =>
      useHeaderNames ? byName[field] : section[index];
    const firstSection = section[0] || '';
    const looksLikeWordSection =
      Boolean(firstSection) &&
      !firstSection.includes('\n') &&
      !/^\s*-\s+/.test(firstSection) &&
      !/^.{1,40}\s*[:：]\s+/.test(firstSection);
    let word = looksLikeWordSection
      ? this.removeInvalidChars(firstSection.split('\n').join(' ').trim())
      : this.removeInvalidChars(fallbackWord || '');
    const definitionIndex = looksLikeWordSection ? 1 : 0;
    const synonymIndex = definitionIndex + 1;
    const antonymIndex = definitionIndex + 2;
    const usageIndex = definitionIndex + 3;
    const culturalContextIndex = definitionIndex + 4;
    const funFactIndex = definitionIndex + 5;

    const response: ExtractedDictionaryResult = {
      word,
    };

    if (pick('definitions', definitionIndex)) {
      const defs = this.extractSection(pick('definitions', definitionIndex));

      if (defs.length) {
        response.definitions = defs;
      }
    }

    if (pick('synonyms', synonymIndex)) {
      let syms = this.extractSimpleList(pick('synonyms', synonymIndex));
      response.syms = syms;
    }

    if (pick('antonyms', antonymIndex)) {
      let ant = this.extractSimpleList(pick('antonyms', antonymIndex));
      response.antm = ant;
    }

    if (pick('usage', usageIndex)) {
      const try1 = this.extractSection(pick('usage', usageIndex)).filter(
        Boolean,
      );
      if (try1.length) {
        response.usage = try1;
      } else {
        const usage = pick('usage', usageIndex)
          .split(/[-•·]\s+/)
          .map((u) => u.trim())
          .filter(Boolean)
          .map((u) => {
            return {
              type: undefined,
              text: this.removeInvalidChars(u.replace(/\”/g, '')),
            };
          });
        response.usage = usage;
      }
    }

    if (pick('cultural', culturalContextIndex)) {
      const culturalContext = this.extractDescriptiveSection(
        pick('cultural', culturalContextIndex),
      );
      if (culturalContext.length) {
        response.cultural_context = culturalContext;
      }
    }

    if (pick('funFacts', funFactIndex)) {
      const funFacts = this.extractDescriptiveSection(
        pick('funFacts', funFactIndex),
      );
      if (funFacts.length) {
        response.fun_facts = funFacts;
      }
    }

    return response;
  }

  async saveSearch(params: {
    word: string;
    language: string;
    result: Record<string, any>;
    userId: string;
  }) {
    return this.db.dictionary_search.create({
      data: {
        word: params.word,
        language: params.language,
        result: JSON.parse(JSON.stringify(params.result)),
        userId: params.userId,
      },
    });
  }

  normalizeStoredSearch(search: dictionary_search) {
    const result =
      search.result &&
      typeof search.result === 'object' &&
      !Array.isArray(search.result)
        ? (search.result as Record<string, unknown>)
        : {};
    const raw = typeof result.raw === 'string' ? result.raw : '';
    const parsed =
      result.parsed &&
      typeof result.parsed === 'object' &&
      !Array.isArray(result.parsed)
        ? result.parsed
        : raw
          ? this.extractRawFromDict(raw)
          : undefined;

    return {
      ...search,
      result: {
        ...result,
        ...(raw ? { raw } : {}),
        ...(typeof result.prompt === 'string' ? { prompt: result.prompt } : {}),
        ...(parsed ? { parsed } : {}),
      },
    };
  }

  async getHistory({
    query,
    userId,
  }: {
    query: GetDictionaryHistoryDto;
    userId: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.dictionary_searchWhereInput = { userId };

    if (query.query) {
      where.word = { contains: query.query, mode: 'insensitive' };
    }

    const [count, searches] = await this.db.$transaction([
      this.db.dictionary_search.count({ where }),
      this.db.dictionary_search.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return {
      message: 'Dictionary history fetched successfully',
      data: searches.map((search) => this.normalizeStoredSearch(search)),
      meta: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  async deleteSearch(id: string, userId: string) {
    const search = await this.db.dictionary_search.findUnique({
      where: { id },
    });

    if (!search || search.userId !== userId) {
      throw new NotFoundException('Dictionary search not found');
    }

    await this.db.dictionary_search.delete({ where: { id } });

    return { message: 'Dictionary search deleted' };
  }
}
