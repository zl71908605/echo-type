export const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
export const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';

/** MyMemory rejects any query longer than this with a 403 payload. */
export const MYMEMORY_MAX_QUERY_CHARS = 500;

export const GOOGLE_TIMEOUT_MS = 1500;
export const MYMEMORY_TIMEOUT_MS = 6000;

const GOOGLE_ATTEMPTS = 2;

/**
 * How long an engine stays skipped after it proved unreachable. Blocked hosts
 * fail by hanging, so without this every request would pay the full timeout
 * before falling through to the next engine.
 */
const ENGINE_CIRCUIT_TTL_MS = 5 * 60 * 1000;

export type FreeTranslateEngine = 'google-free' | 'mymemory-free';

export class UpstreamTranslateError extends Error {
  status: number;
  /** True when the engine could not be reached at all (timeout/DNS/refused). */
  unreachable: boolean;

  constructor(message: string, status = 502, unreachable = false) {
    super(message);
    this.name = 'UpstreamTranslateError';
    this.status = status;
    this.unreachable = unreachable;
  }
}

type EngineId = 'google' | 'myMemory';

const circuitOpenUntil: Record<EngineId, number> = { google: 0, myMemory: 0 };

function isCircuitOpen(engine: EngineId): boolean {
  return Date.now() < circuitOpenUntil[engine];
}

function openCircuit(engine: EngineId): void {
  circuitOpenUntil[engine] = Date.now() + ENGINE_CIRCUIT_TTL_MS;
}

/** Test seam: forget everything learned about engine reachability. */
export function resetEngineCircuits(): void {
  circuitOpenUntil.google = 0;
  circuitOpenUntil.myMemory = 0;
}

/**
 * Per-request engine health, seeded from the circuit state. Once an engine
 * fails mid-batch we stop paying its timeout for the remaining sentences.
 */
export interface EngineAvailability {
  google: boolean;
  myMemory: boolean;
}

export function createEngineAvailability(): EngineAvailability {
  return { google: !isCircuitOpen('google'), myMemory: !isCircuitOpen('myMemory') };
}

/** Google's `tl` parameter wants a bare language code (`zh-CN` → `zh`). */
export function toGoogleTargetLang(targetLang: string): string {
  return targetLang.replace('_', '-').split('-')[0] || targetLang;
}

/** MyMemory wants a `source|target` pair and keeps the region (`zh-CN`). */
export function toMyMemoryLangPair(targetLang: string): string {
  return `en|${targetLang.replace('_', '-')}`;
}

/**
 * Split text into MyMemory-sized pieces, preferring sentence then word
 * boundaries so the joined result stays readable.
 */
export function splitForMyMemory(text: string, limit = MYMEMORY_MAX_QUERY_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  const pieces: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };

  for (const segment of trimmed.match(/[^.!?]+[.!?]*\s*/g) ?? [trimmed]) {
    let remaining = segment;

    while (remaining.length > 0) {
      if (current.length + remaining.length <= limit) {
        current += remaining;
        break;
      }

      if (current.length > 0) {
        current += remaining.slice(0, limit - current.length);
        remaining = remaining.slice(limit - current.length);
        flush();
        continue;
      }

      // A single segment longer than the limit: break on the last word boundary.
      let cut = remaining.lastIndexOf(' ', limit);
      if (cut <= 0) cut = limit;
      pieces.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut);
    }
  }

  flush();
  return pieces;
}

async function fetchWithRetry(url: string, attempts: number, timeoutMs: number): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function requestGoogle(chunk: string, targetLang: string): Promise<string> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: toGoogleTargetLang(targetLang),
    dt: 't',
    dj: '1',
    q: chunk,
  });

  let res: Response;
  try {
    res = await fetchWithRetry(`${GOOGLE_TRANSLATE_ENDPOINT}?${params}`, GOOGLE_ATTEMPTS, GOOGLE_TIMEOUT_MS);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unreachable';
    throw new UpstreamTranslateError(`Google Translate unreachable: ${reason}`, 502, true);
  }

  if (!res.ok) {
    throw new UpstreamTranslateError(`Google Translate error: ${res.status}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new UpstreamTranslateError('Google Translate returned invalid JSON');
  }

  const sentences = (data as { sentences?: { trans?: string }[] }).sentences;
  return (
    sentences
      ?.map((sentence) => sentence.trans)
      .filter(Boolean)
      .join('') || ''
  );
}

async function requestMyMemoryChunk(chunk: string, targetLang: string): Promise<string> {
  const params = new URLSearchParams({
    q: chunk,
    langpair: toMyMemoryLangPair(targetLang),
  });

  let res: Response;
  try {
    res = await fetchWithRetry(`${MYMEMORY_ENDPOINT}?${params}`, 1, MYMEMORY_TIMEOUT_MS);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unreachable';
    throw new UpstreamTranslateError(`MyMemory unreachable: ${reason}`, 502, true);
  }

  if (!res.ok) {
    throw new UpstreamTranslateError(`MyMemory error: ${res.status}`);
  }

  let data: { responseData?: { translatedText?: string }; responseDetails?: unknown };
  try {
    data = await res.json();
  } catch {
    throw new UpstreamTranslateError('MyMemory returned invalid JSON');
  }

  const translated = data.responseData?.translatedText;
  const details = typeof data.responseDetails === 'string' ? data.responseDetails : '';

  // MyMemory reports quota exhaustion and length violations inside a HTTP 200 body.
  if (!translated || /MYMEMORY WARNING|LIMIT EXCEEDED|NO QUERY SPECIFIED/i.test(translated)) {
    throw new UpstreamTranslateError(`MyMemory error: ${translated || details || 'empty response'}`);
  }

  return translated;
}

async function requestMyMemory(text: string, targetLang: string): Promise<string> {
  const pieces = splitForMyMemory(text);
  const translations: string[] = [];

  for (const piece of pieces) {
    translations.push(await requestMyMemoryChunk(piece, targetLang));
  }

  return translations.join('');
}

export interface TranslateChunkResult {
  text: string;
  engine: FreeTranslateEngine;
}

/**
 * Translate one chunk through the keyless engine chain (Google → MyMemory).
 * Throws when both engines are unavailable so callers can hand the text to the
 * built-in AI endpoint instead.
 */
export async function translateChunk(
  chunk: string,
  targetLang: string,
  availability: EngineAvailability,
): Promise<TranslateChunkResult> {
  const failures: string[] = [];

  if (availability.google) {
    try {
      const text = await requestGoogle(chunk, targetLang);
      if (text) return { text, engine: 'google-free' };
      failures.push('Google Translate returned an empty translation');
    } catch (error) {
      availability.google = false;
      if (error instanceof UpstreamTranslateError && error.unreachable) openCircuit('google');
      failures.push(error instanceof Error ? error.message : 'Google Translate failed');
    }
  }

  if (availability.myMemory) {
    try {
      const text = await requestMyMemory(chunk, targetLang);
      if (text) return { text, engine: 'mymemory-free' };
      failures.push('MyMemory returned an empty translation');
    } catch (error) {
      availability.myMemory = false;
      if (error instanceof UpstreamTranslateError && error.unreachable) openCircuit('myMemory');
      failures.push(error instanceof Error ? error.message : 'MyMemory failed');
    }
  }

  throw new UpstreamTranslateError(failures.join('; ') || 'No translation engine available');
}
