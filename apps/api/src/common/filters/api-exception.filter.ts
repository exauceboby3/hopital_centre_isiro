import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ApiFieldError } from '../validation-errors';

interface ErrorPayload {
  status: number;
  code: string;
  message: string;
  errors?: ApiFieldError[];
}

const statusDefaults: Record<number, { code: string; message: string }> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'INVALID_REQUEST',
    message: 'La demande contient des informations invalides.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Votre session est absente ou expirée. Reconnectez-vous.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'ACCESS_DENIED',
    message: 'Votre compte ne possède pas la permission nécessaire pour cette action.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'NOT_FOUND',
    message: 'La ressource demandée est introuvable ou a été supprimée.',
  },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: 'METHOD_NOT_ALLOWED',
    message: 'Cette action n’est pas disponible sur cette ressource.',
  },
  [HttpStatus.REQUEST_TIMEOUT]: {
    code: 'REQUEST_TIMEOUT',
    message: 'La demande a pris trop de temps. Vérifiez le réseau puis réessayez.',
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: 'Cette opération entre en conflit avec des données déjà enregistrées.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Le fichier ou le formulaire envoyé est trop volumineux.',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: 'UNSUPPORTED_FILE_TYPE',
    message: 'Le format du fichier ou du contenu envoyé n’est pas accepté.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'UNPROCESSABLE_DATA',
    message: 'Les informations sont valides mais ne peuvent pas être traitées dans cet état.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Trop de tentatives ont été effectuées. Patientez quelques instants puis réessayez.',
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    code: 'INTERNAL_ERROR',
    message: 'Une erreur interne est survenue. Réessayez ou contactez l’administrateur.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Le service est temporairement indisponible. Réessayez dans quelques instants.',
  },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = randomUUID();
    const payload = this.resolve(exception);

    if (payload.status >= 500) {
      const errorName = exception instanceof Error ? exception.name : typeof exception;
      this.logger.error(
        `Erreur ${requestId} (${errorName}) pendant ${request.method} ${request.path}`,
      );
    }

    response.setHeader('x-request-id', requestId);
    response.status(payload.status).json({
      statusCode: payload.status,
      code: payload.code,
      message: payload.message,
      ...(payload.errors?.length ? { errors: payload.errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.path,
      requestId,
    });
  }

  private resolve(exception: unknown): ErrorPayload {
    if (exception instanceof HttpException) return this.fromHttpException(exception);

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaCode(exception.code);
    }
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_UNAVAILABLE',
        message:
          'La base de données est indisponible. Vérifiez PostgreSQL puis contactez l’administrateur.',
      };
    }
    if (exception instanceof SyntaxError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_JSON',
        message:
          'Le formulaire envoyé est illisible ou incomplet. Rechargez la page puis réessayez.',
      };
    }
    if (this.statusOf(exception) === HttpStatus.PAYLOAD_TOO_LARGE) {
      return this.defaultFor(HttpStatus.PAYLOAD_TOO_LARGE);
    }
    return this.defaultFor(HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private fromHttpException(exception: HttpException): ErrorPayload {
    const status = exception.getStatus();
    const fallback = this.defaultFor(status);
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { ...fallback, message: this.translateDefault(response) };
    }
    if (!response || typeof response !== 'object') return fallback;

    const value = response as {
      code?: unknown;
      message?: unknown;
      errors?: unknown;
    };
    const rawMessages = Array.isArray(value.message)
      ? value.message.filter((item): item is string => typeof item === 'string')
      : typeof value.message === 'string'
        ? [value.message]
        : [];
    const message = rawMessages.length
      ? rawMessages.map((item) => this.translateDefault(item)).join(' ')
      : fallback.message;
    const errors = Array.isArray(value.errors)
      ? value.errors.filter((item: unknown): item is ApiFieldError => this.isFieldError(item))
      : undefined;
    return {
      status,
      code: typeof value.code === 'string' ? value.code : fallback.code,
      message,
      errors,
    };
  }

  private fromPrismaCode(code: string): ErrorPayload {
    const errors: Record<string, ErrorPayload> = {
      P2000: {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALUE_TOO_LONG',
        message: 'Une des informations saisies est trop longue pour être enregistrée.',
      },
      P2001: {
        status: HttpStatus.NOT_FOUND,
        code: 'RECORD_NOT_FOUND',
        message: 'L’enregistrement demandé est introuvable.',
      },
      P2002: {
        status: HttpStatus.CONFLICT,
        code: 'DUPLICATE_RECORD',
        message: 'Un enregistrement avec les mêmes informations existe déjà.',
      },
      P2003: {
        status: HttpStatus.CONFLICT,
        code: 'LINKED_RECORD',
        message:
          'Cette donnée est encore utilisée par un autre dossier. Désactivez-la au lieu de la supprimer.',
      },
      P2011: {
        status: HttpStatus.BAD_REQUEST,
        code: 'REQUIRED_VALUE_MISSING',
        message: 'Une information obligatoire est absente. Vérifiez tous les champs requis.',
      },
      P2014: {
        status: HttpStatus.CONFLICT,
        code: 'REQUIRED_RELATION',
        message: 'Cette modification romprait un lien obligatoire avec un autre dossier.',
      },
      P2021: {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_SCHEMA_MISSING',
        message:
          'La base de données n’est pas à jour. L’administrateur doit appliquer les migrations.',
      },
      P2022: {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_SCHEMA_OUTDATED',
        message:
          'La structure de la base est ancienne. L’administrateur doit appliquer les migrations.',
      },
      P2024: {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_BUSY',
        message: 'La base de données est momentanément occupée. Réessayez dans quelques secondes.',
      },
      P2025: {
        status: HttpStatus.NOT_FOUND,
        code: 'RECORD_NOT_FOUND',
        message: 'L’enregistrement demandé est introuvable ou a déjà été supprimé.',
      },
      P2034: {
        status: HttpStatus.CONFLICT,
        code: 'CONCURRENT_UPDATE',
        message:
          'Ces informations ont été modifiées en même temps par un autre utilisateur. Rechargez puis réessayez.',
      },
    };
    return errors[code] ?? this.defaultFor(HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private translateDefault(message: string): string {
    if (/uuid is expected/i.test(message)) return 'L’identifiant fourni est invalide.';
    if (/enum string is expected/i.test(message))
      return 'La valeur sélectionnée n’est pas autorisée.';
    if (/boolean string is expected/i.test(message)) return 'La valeur doit être vraie ou fausse.';
    if (/numeric string is expected/i.test(message)) return 'La valeur doit être un nombre.';
    if (message === 'Unauthorized') return statusDefaults[HttpStatus.UNAUTHORIZED]!.message;
    if (message === 'Forbidden resource') return statusDefaults[HttpStatus.FORBIDDEN]!.message;
    if (message === 'Not Found') return statusDefaults[HttpStatus.NOT_FOUND]!.message;
    return message;
  }

  private isFieldError(item: unknown): item is ApiFieldError {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.field === 'string' && typeof candidate.message === 'string';
  }

  private statusOf(exception: unknown): number | undefined {
    if (!exception || typeof exception !== 'object' || !('status' in exception)) return undefined;
    return typeof exception.status === 'number' ? exception.status : undefined;
  }

  private defaultFor(status: number): ErrorPayload {
    const fallback = statusDefaults[status] ?? statusDefaults[HttpStatus.INTERNAL_SERVER_ERROR]!;
    return { status, ...fallback };
  }
}
