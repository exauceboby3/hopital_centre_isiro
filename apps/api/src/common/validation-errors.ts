import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export interface ApiFieldError {
  field: string;
  message: string;
}

const constraintMessages: Record<string, (field: string) => string> = {
  whitelistValidation: (field) =>
    `Le champ « ${field} » n’est pas autorisé. Les champs techniques sont gérés automatiquement.`,
  isDefined: (field) => `Le champ « ${field} » est obligatoire.`,
  isNotEmpty: (field) => `Le champ « ${field} » ne peut pas être vide.`,
  isString: (field) => `Le champ « ${field} » doit être un texte.`,
  isBoolean: (field) => `Le champ « ${field} » doit être vrai ou faux.`,
  isNumber: (field) => `Le champ « ${field} » doit être un nombre.`,
  isInt: (field) => `Le champ « ${field} » doit être un nombre entier.`,
  isPositive: (field) => `Le champ « ${field} » doit être supérieur à zéro.`,
  min: (field) => `La valeur du champ « ${field} » est trop petite.`,
  max: (field) => `La valeur du champ « ${field} » est trop grande.`,
  minLength: (field) => `Le champ « ${field} » est trop court.`,
  maxLength: (field) => `Le champ « ${field} » est trop long.`,
  isEmail: (field) => `Le champ « ${field} » doit contenir une adresse e-mail valide.`,
  isUrl: (field) => `Le champ « ${field} » doit contenir une adresse URL complète et valide.`,
  isUUID: (field) => `Le champ « ${field} » contient un identifiant invalide.`,
  isDate: (field) => `Le champ « ${field} » doit contenir une date valide.`,
  isDateString: (field) => `Le champ « ${field} » doit contenir une date valide.`,
  isEnum: (field) => `La valeur du champ « ${field} » n’est pas proposée par le système.`,
  isIn: (field) => `La valeur du champ « ${field} » n’est pas autorisée.`,
  matches: (field) => `Le format du champ « ${field} » est invalide.`,
  isArray: (field) => `Le champ « ${field} » doit contenir une liste.`,
  arrayMinSize: (field) => `Le champ « ${field} » ne contient pas assez d’éléments.`,
  arrayMaxSize: (field) => `Le champ « ${field} » contient trop d’éléments.`,
  arrayUnique: (field) => `Le champ « ${field} » contient des éléments en double.`,
  isObject: (field) => `Le champ « ${field} » doit contenir un objet structuré.`,
};

export function formatValidationErrors(errors: ValidationError[], parent = ''): ApiFieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const ownErrors = Object.keys(error.constraints ?? {}).map((constraint) => ({
      field,
      message:
        constraintMessages[constraint]?.(field) ?? `La valeur du champ « ${field} » est invalide.`,
    }));
    return [...ownErrors, ...formatValidationErrors(error.children ?? [], field)];
  });
}

export function validationException(errors: ValidationError[]): BadRequestException {
  const details = formatValidationErrors(errors);
  const summary = details
    .slice(0, 6)
    .map((detail) => detail.message)
    .join(' ');
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: summary || 'Certaines informations sont invalides. Vérifiez le formulaire.',
    errors: details,
  });
}
