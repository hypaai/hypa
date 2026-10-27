import { resolveModelName } from '@/lib/model-languages';

export function resolveDictionaryModelName(modelName?: string | null): string | undefined {
  return resolveModelName('AC', modelName);
}
