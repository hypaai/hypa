import { getNonHypaDictionaryPrompt, renderPrompt } from '@hypa/config/prompts';

export function buildDictionaryPrompt(
  language: string,
  word: string,
  options?: { cultural_context?: boolean; fun_fact?: boolean },
  provider = 'hypaai',
) {
  const providerName = provider === 'hypaai' ? 'Hypa' : provider;

  if (provider !== 'hypaai') {
    const prompt = getNonHypaDictionaryPrompt();
    const systemPrompt = prompt.find(({ role }) => role === 'system')?.content;
    if (!systemPrompt || !prompt.some(({ role }) => role === 'user')) {
      throw new Error('Non-Hypa dictionary system prompt is not configured');
    }

    const sections =
      [
        options?.cultural_context ? '### Cultural Context:' : '',
        options?.fun_fact ? '### Fun Fact:' : '',
      ]
        .filter(Boolean)
        .join('\n') ||
      '### Word:\n### Definition:\n### Synonyms:\n### Antonyms:\n### Examples Usage:\n### Cultural Context:\n### Fun Fact:';
    const values = { provider: providerName, language, word, sections };

    return prompt.map(({ role, content }) => ({
      role,
      content: renderPrompt(content, values),
    }));
  }

  const sections =
    '### Word:\n### Definition:\n### Synonyms:\n### Antonyms:\n### Examples Usage:\n### Cultural Context:\n### Fun Fact:';

  if (options?.cultural_context) {
    return [
      {
        role: 'system' as const,
        content: `You are Hypa Dictionary, a ${language} dictionary. Given a word, return its cultural context in:\n\n### Cultural Context:"}`,
      },
      { role: 'user' as const, content: word },
    ];
  }

  if (options?.fun_fact) {
    return [
      {
        role: 'system' as const,
        content: `You are Hypa Dictionary, a ${language} dictionary. Given a word, return the Fun Fact in:\n\n### Fun Fact:"`,
      },
      { role: 'user' as const, content: word },
    ];
  }

  return [
    {
      role: 'system' as const,
      content: `You are Hypa Dictionary, a ${language} dictionary. Given a word, return:\n\n${sections}\n\nUse this structure only. No tables and keep each section header in English.`,
    },
    { role: 'user' as const, content: word },
  ];
}
