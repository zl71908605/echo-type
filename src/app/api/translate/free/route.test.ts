import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PendingResponse = {
  url: string;
  resolve: (response: Response) => void;
};

const fetchMock = vi.fn();
const pendingResponses: PendingResponse[] = [];

vi.stubGlobal('fetch', fetchMock);

const { POST } = await import('./route');
const { resetEngineCircuits } = await import('@/lib/free-translate');

const GOOGLE_HOST = 'translate.googleapis.com';
const MYMEMORY_HOST = 'api.mymemory.translated.net';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/translate/free', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function googleResponse(translation: string) {
  return new Response(JSON.stringify({ sentences: [{ trans: translation }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function myMemoryResponse(translation: string) {
  return new Response(
    JSON.stringify({ responseData: { translatedText: translation }, responseStatus: 200, responseDetails: '' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function hostOf(url: string) {
  return new URL(url).host;
}

describe('POST /api/translate/free', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pendingResponses.length = 0;
    resetEngineCircuits();
  });

  it('dispatches batch sentence translations with a bounded concurrency window', async () => {
    fetchMock.mockImplementation((url: string) => {
      return new Promise<Response>((resolve) => {
        pendingResponses.push({ url, resolve });
      });
    });

    const responsePromise = POST(
      makeRequest({
        sentences: ['First sentence.', 'Second sentence.', 'Third sentence.', 'Fourth sentence.', 'Fifth sentence.'],
        targetLang: 'zh-CN',
      }),
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(pendingResponses).toHaveLength(4);

    for (const pending of pendingResponses.slice(0, 4)) {
      const sentence = new URL(pending.url).searchParams.get('q') ?? '';
      pending.resolve(googleResponse(`zh:${sentence}`));
    }

    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(pendingResponses).toHaveLength(5);

    const lastPending = pendingResponses[4];
    if (!lastPending) {
      throw new Error('Expected fifth pending request');
    }
    const sentence = new URL(lastPending.url).searchParams.get('q') ?? '';
    lastPending.resolve(googleResponse(`zh:${sentence}`));

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      translations: [
        'zh:First sentence.',
        'zh:Second sentence.',
        'zh:Third sentence.',
        'zh:Fourth sentence.',
        'zh:Fifth sentence.',
      ],
      engines: Array(5).fill('google-free'),
      engine: 'google-free',
    });
  });

  it('falls back to MyMemory when Google Translate is unreachable', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (hostOf(url) === GOOGLE_HOST) {
        return Promise.reject(new Error('The operation was aborted due to timeout'));
      }
      return Promise.resolve(myMemoryResponse('你好，世界。'));
    });

    const response = await POST(makeRequest({ text: 'Hello world.', targetLang: 'zh-CN' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ translation: '你好，世界。', engine: 'mymemory-free' });

    const hosts = fetchMock.mock.calls.map(([url]) => hostOf(url as string));
    expect(hosts.filter((host) => host === MYMEMORY_HOST)).toHaveLength(1);
    // Google is probed once per request, not once per sentence.
    expect(hosts.filter((host) => host === GOOGLE_HOST).length).toBeLessThanOrEqual(2);
  });

  it('splits oversized text before calling MyMemory', async () => {
    const longText = `${'The quick brown fox jumps over the lazy dog. '.repeat(20)}`.trim();
    expect(longText.length).toBeGreaterThan(500);

    fetchMock.mockImplementation((url: string) => {
      if (hostOf(url) === GOOGLE_HOST) {
        return Promise.reject(new Error('unreachable'));
      }

      const query = new URL(url).searchParams.get('q') ?? '';
      expect(query.length).toBeLessThanOrEqual(500);
      return Promise.resolve(myMemoryResponse(`zh:${query.slice(0, 5)}`));
    });

    const response = await POST(makeRequest({ text: longText, targetLang: 'zh-CN' }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { engine: string; translation: string };
    expect(body.engine).toBe('mymemory-free');
    expect(body.translation.length).toBeGreaterThan(0);
  });

  it('stops probing an unreachable engine until its circuit expires', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (hostOf(url) === GOOGLE_HOST) {
        return Promise.reject(new Error('The operation was aborted due to timeout'));
      }
      return Promise.resolve(myMemoryResponse('你好。'));
    });

    await POST(makeRequest({ text: 'Hello.', targetLang: 'zh-CN' }));
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(fetchMock.mock.calls.some(([url]) => hostOf(url as string) === GOOGLE_HOST)).toBe(true);

    fetchMock.mockClear();
    const response = await POST(makeRequest({ text: 'Hello again.', targetLang: 'zh-CN' }));

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.every(([url]) => hostOf(url as string) === MYMEMORY_HOST)).toBe(true);
    expect(callsAfterFirst).toBeGreaterThan(0);
  });

  it('reports a dependency error only when every engine fails', async () => {
    fetchMock.mockResolvedValue(
      new Response('service unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const response = await POST(
      makeRequest({
        text: 'Hello world.',
        targetLang: 'zh-CN',
      }),
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Google Translate error: 503');
    expect(body.error).toContain('MyMemory error: 503');
  });
});
