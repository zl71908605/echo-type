import { NextRequest, NextResponse } from 'next/server';
import {
  createEngineAvailability,
  type FreeTranslateEngine,
  translateChunk,
  UpstreamTranslateError,
} from '@/lib/free-translate';

const TRANSLATION_CONCURRENCY = 4;

interface FreeTranslateBody {
  text?: string;
  sentences?: string[];
  targetLang?: string;
}

/**
 * Keyless translation endpoint.
 *
 * Engine chain: Google Translate (unofficial) → MyMemory. Google is blocked on
 * some networks and fails by hanging, so MyMemory keeps this endpoint working
 * without an API key.
 *
 * Callers that need the built-in AI as a further fallback should call
 * `/api/translate`, which resolves the configured provider and its rate limits.
 */
export async function POST(req: NextRequest) {
  try {
    const { text, sentences, targetLang = 'zh-CN' }: FreeTranslateBody = await req.json();

    if ((!text && (!sentences || sentences.length === 0)) || !targetLang) {
      return NextResponse.json({ error: 'Missing text/sentences or targetLang' }, { status: 400 });
    }

    const availability = createEngineAvailability();
    const chunks = Array.isArray(sentences) && sentences.length > 0 ? sentences : [text ?? ''];
    const results = new Array<{ text: string; engine: FreeTranslateEngine } | undefined>(chunks.length);
    const failures: string[] = [];

    for (let start = 0; start < chunks.length; start += TRANSLATION_CONCURRENCY) {
      const window = chunks.slice(start, start + TRANSLATION_CONCURRENCY);
      const settled = await Promise.all(
        window.map(async (chunk, offset) => {
          try {
            return { index: start + offset, result: await translateChunk(chunk, targetLang, availability) };
          } catch (error) {
            return {
              index: start + offset,
              result: undefined,
              error: error instanceof Error ? error.message : 'Translation failed',
            };
          }
        }),
      );

      for (const { index, result, error } of settled) {
        results[index] = result;
        if (error && !failures.includes(error)) failures.push(error);
      }
    }

    if (results.every((result) => !result)) {
      return NextResponse.json({ error: failures.join('; ') || 'Translation failed' }, { status: 502 });
    }

    const engines = results.map((result) => result?.engine ?? 'none');
    const engine = engines.every((value) => value === engines[0]) ? engines[0] : 'mixed';

    if (Array.isArray(sentences) && sentences.length > 0) {
      return NextResponse.json({
        translations: results.map((result) => result?.text ?? ''),
        engines,
        engine,
      });
    }

    return NextResponse.json({
      translation: results[0]?.text ?? '',
      engine,
    });
  } catch (error) {
    console.error('Free translate error:', error);
    if (error instanceof UpstreamTranslateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Free translation failed' },
      { status: 500 },
    );
  }
}
