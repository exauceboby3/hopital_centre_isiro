import { api, ApiError } from './api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('ApiError', () => {
  it('conserve le code, la référence et les erreurs de champ', () => {
    const error = new ApiError('Formulaire invalide.', 400, 'VALIDATION_ERROR', 'req-123', [
      { field: 'email', message: 'Adresse e-mail invalide.' },
    ]);

    expect(error).toMatchObject({
      name: 'ApiError',
      message: 'Formulaire invalide.',
      status: 400,
      code: 'VALIDATION_ERROR',
      requestId: 'req-123',
      details: [{ field: 'email' }],
    });
  });
});

describe('api', () => {
  it('accepte une réponse réussie dont le corps est vide', async () => {
    globalThis.fetch = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(api<void>('/messages/message-1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('continue de décoder une réponse JSON réussie', async () => {
    globalThis.fetch = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(api<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('remplace un JSON invalide par une erreur applicative contrôlée', async () => {
    globalThis.fetch = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValue(
        new Response('{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(api('/broken')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'INVALID_JSON_RESPONSE',
      status: 200,
    });
  });
});
