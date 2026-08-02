import { api, apiUrl } from './api';

export interface DownloadedApiFile {
  blob: Blob;
  fileName: string;
}

function fileNameFromHeaders(response: Response, fallback: string): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(disposition)?.[1];
  return quoted || fallback;
}

async function fetchDownload(path: string, allowRefresh: boolean): Promise<Response> {
  const response = await fetch(apiUrl(path), { credentials: 'include' });
  if (response.status === 401 && allowRefresh) {
    await api('/auth/refresh', { method: 'POST' });
    return fetchDownload(path, false);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : payload?.message || 'Téléchargement impossible.';
    throw new Error(message);
  }
  return response;
}

export async function downloadApiFile(path: string, fallback: string): Promise<DownloadedApiFile> {
  const response = await fetchDownload(path, true);
  return {
    blob: await response.blob(),
    fileName: fileNameFromHeaders(response, fallback),
  };
}

export function saveDownloadedFile(file: DownloadedApiFile) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
