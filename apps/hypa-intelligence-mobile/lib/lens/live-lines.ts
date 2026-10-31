export const STABLE_MS = 250;
export const RETRY_AFTER_MS = 5000;
const MAX_ENTRIES = 500;
const MIN_SIMILARITY = 0.8;

export function normalizeLine(text: string) {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function hasWords(text: string) {
  return /\p{L}/u.test(text);
}

function digitRuns(text: string) {
  const grouped = text.replace(/(\d)[\s,'’](?=\d{3}(?!\d))/g, '$1');
  return (grouped.match(/\d+/g) ?? []).sort().join(' ');
}

function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function similarity(a: string, b: string) {
  const left = a.toLocaleLowerCase();
  const right = b.toLocaleLowerCase();
  const longest = Math.max(left.length, right.length);
  if (!longest) return 1;
  if (Math.min(left.length, right.length) / longest < MIN_SIMILARITY) return 0;
  return 1 - distance(left, right) / longest;
}

export function keepsNumbers(source: string, translation: string) {
  return digitRuns(source) === digitRuns(translation);
}

type Entry =
  | { state: 'pending' }
  | { state: 'done'; text: string }
  | { state: 'failed'; at: number };

export class LiveLines {
  private seen = new Map<string, number>();
  private entries = new Map<string, Entry>();

  constructor(
    private readonly stableMs = STABLE_MS,
    private readonly retryAfterMs = RETRY_AFTER_MS,
  ) {}

  private key(line: string, target: string) {
    return `${target}\n${line}`;
  }

  private closest(line: string, target: string, accept: (entry: Entry) => boolean) {
    const exact = this.entries.get(this.key(line, target));
    if (exact && accept(exact)) return exact;
    const prefix = `${target}\n`;
    let best: Entry | undefined;
    let score = MIN_SIMILARITY;
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(prefix) || !accept(entry)) continue;
      const value = similarity(line, key.slice(prefix.length));
      if (value >= score) {
        best = entry;
        score = value;
      }
    }
    return best;
  }

  observe(lines: string[], target: string, now: number, limit = Infinity): string[] {
    const current = new Set(lines.map(normalizeLine).filter(hasWords));
    for (const line of this.seen.keys()) {
      if (!current.has(line)) this.seen.delete(line);
    }

    const due: string[] = [];
    for (const line of current) {
      const since = this.seen.get(line);
      if (since === undefined) {
        this.seen.set(line, now);
        if (this.stableMs > 0) continue;
      } else if (now - since < this.stableMs) {
        continue;
      }
      const entry = this.entries.get(this.key(line, target));
      if (entry?.state === 'done' || entry?.state === 'pending') continue;
      if (this.closest(line, target, (other) => other.state !== 'failed')) continue;
      if (entry?.state === 'failed' && now - entry.at < this.retryAfterMs) continue;
      if (due.length >= limit) continue;
      due.push(line);
    }
    for (const line of due) this.entries.set(this.key(line, target), { state: 'pending' });
    return due;
  }

  isLoading(line: string, target: string) {
    const text = normalizeLine(line);
    if (!hasWords(text)) return false;
    const entry = this.closest(text, target, () => true);
    return !entry || entry.state === 'pending';
  }

  lookup(line: string, target: string) {
    const entry = this.closest(normalizeLine(line), target, (other) => other.state === 'done');
    return entry?.state === 'done' ? entry.text : undefined;
  }

  resolve(target: string, results: { line: string; translation: string }[]) {
    for (const { line, translation } of results) {
      const text = translation.trim();
      const safe = text && keepsNumbers(line, text) ? text : line;
      const key = this.key(line, target);
      this.entries.delete(key);
      this.entries.set(key, { state: 'done', text: safe });
    }
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear() {
    this.seen.clear();
    this.entries.clear();
  }

  reject(target: string, lines: string[], now: number) {
    for (const line of lines) this.entries.set(this.key(line, target), { state: 'failed', at: now });
  }
}
