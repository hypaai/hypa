export class EmptyTranslationError extends Error {
  constructor() {
    super('Provider returned unusable translation output');
    this.name = 'EmptyTranslationError';
  }
}

export class ProviderConfigurationError extends Error {
  constructor() {
    super('Translation provider configuration is unavailable');
    this.name = 'ProviderConfigurationError';
  }
}

export function assertUsableTranslation(text: string): void {
  if (typeof text !== 'string') throw new EmptyTranslationError();
  const visible = text
    .replace(/<\|?think>[\s\S]*?<\/?think>/gi, '')
    .replace(/<\|?think>[\s\S]*$/gi, '');
  if (!visible.trim()) {
    throw new EmptyTranslationError();
  }
}
