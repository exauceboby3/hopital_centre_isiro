import { ValidationError } from 'class-validator';
import { formatValidationErrors, validationException } from './validation-errors';

describe('messages de validation', () => {
  it('explique clairement les champs techniques interdits', () => {
    const errors = [
      {
        property: 'updatedAt',
        constraints: { whitelistValidation: 'property updatedAt should not exist' },
      } as ValidationError,
    ];

    expect(formatValidationErrors(errors)).toEqual([
      {
        field: 'updatedAt',
        message:
          'Le champ « updatedAt » n’est pas autorisé. Les champs techniques sont gérés automatiquement.',
      },
    ]);
  });

  it('conserve le chemin des erreurs dans les listes imbriquées', () => {
    const errors = [
      {
        property: 'items',
        children: [
          {
            property: '0',
            children: [
              { property: 'quantity', constraints: { isInt: 'quantity must be an integer' } },
            ],
          },
        ],
      } as ValidationError,
    ];

    expect(formatValidationErrors(errors)[0]).toEqual({
      field: 'items.0.quantity',
      message: 'Le champ « items.0.quantity » doit être un nombre entier.',
    });
  });

  it('retourne une réponse API structurée', () => {
    const exception = validationException([
      { property: 'email', constraints: { isEmail: 'email must be an email' } },
    ]);

    expect(exception.getResponse()).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'email' }],
    });
  });
});
