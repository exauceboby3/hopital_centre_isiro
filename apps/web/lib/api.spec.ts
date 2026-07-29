import { ApiError } from './api';

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
