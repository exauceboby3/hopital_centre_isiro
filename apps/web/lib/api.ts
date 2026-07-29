import { notifyError } from './notifications';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'UNKNOWN_ERROR',
    readonly requestId?: string,
    readonly details: Array<{ field: string; message: string }> = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const statusMessages: Record<number, string> = {
  400: 'Le formulaire contient des informations invalides.',
  401: 'Votre session est expirée. Reconnectez-vous.',
  403: 'Votre compte ne possède pas la permission nécessaire.',
  404: 'L’information demandée est introuvable.',
  405: 'Cette action n’est pas disponible.',
  408: 'La demande a pris trop de temps. Vérifiez le réseau puis réessayez.',
  409: 'Les données ont changé ou existent déjà. Rechargez puis réessayez.',
  413: 'Le fichier ou le formulaire envoyé est trop volumineux.',
  415: 'Le format du fichier ou des données envoyées n’est pas accepté.',
  422: 'Ces informations ne peuvent pas être traitées dans leur état actuel.',
  429: 'Trop de tentatives. Patientez quelques instants puis réessayez.',
  500: 'Une erreur interne est survenue. Contactez l’administrateur si elle persiste.',
  502: 'Le serveur intermédiaire ne répond pas correctement.',
  503: 'Le service est temporairement indisponible.',
  504: 'Le serveur met trop de temps à répondre. Réessayez.',
};

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    const message =
      'Impossible de joindre le serveur. Vérifiez que l’API fonctionne et que le réseau est disponible.';
    notifyError(message, 'Serveur indisponible');
    throw new ApiError(message, 0, 'NETWORK_ERROR');
  }
}

async function request<T>(path: string, init: RequestInit, allowRefresh: boolean): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await safeFetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
    const refreshed = await safeFetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshed.ok) {
      return request<T>(path, init, false);
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
      code?: string;
      requestId?: string;
      errors?: Array<{ field: string; message: string }>;
    } | null;
    let message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : (payload?.message ?? statusMessages[response.status] ?? 'Une erreur est survenue.');
    if (response.status >= 500 && payload?.requestId) {
      message = `${message} Référence : ${payload.requestId}.`;
    }
    notifyError(message);
    throw new ApiError(
      message,
      response.status,
      payload?.code ?? `HTTP_${response.status}`,
      payload?.requestId,
      payload?.errors ?? [],
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, true);
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
