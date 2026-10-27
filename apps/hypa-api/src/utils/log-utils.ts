const REDACTED_LOG_KEYS = new Set([
  'audio',
  'audio_b64',
  'enrollment_data',
  'image',
  'text',
  'token',
]);

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 240 ? `${value.slice(0, 240)}...<truncated>` : value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (REDACTED_LOG_KEYS.has(key.toLowerCase())) {
        sanitized[key] =
          typeof item === 'string'
            ? `<redacted ${key}, length=${item.length}>`
            : `<redacted ${key}>`;
        continue;
      }
      sanitized[key] = sanitizeForLog(item);
    }
    return sanitized;
  }

  return value;
}
