import { Observable } from 'rxjs';
import { Readable } from 'stream';
import { Debug } from 'src/utils/debug';
import { StreamChunk } from './ai.types';

export function parseSseStream(stream: Readable): Observable<StreamChunk> {
  return new Observable((subscriber) => {
    let fullContent = '';

    stream.on('data', (chunk: Buffer) => {
      const raw = chunk.toString();
      const lines = raw.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[DONE]') continue;

        const dataStr = trimmed.startsWith('data: ')
          ? trimmed.slice(6).trim()
          : trimmed;

        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const delta = String(parsed?.choices?.[0]?.delta?.content || '');
          if (delta) {
            fullContent += delta;
            subscriber.next({
              delta,
              fullContent,
              complete: false,
              raw: parsed,
            });
          }
        } catch {}
      }
    });

    stream.on('end', () => {
      subscriber.next({ delta: '', fullContent, complete: true });
      subscriber.complete();
    });

    stream.on('error', (error) => {
      Debug.error('SSE stream error:', error);
      subscriber.error(error);
    });
  });
}
