'use client';

import { api, ApiError } from './api';

const DATABASE = 'hopital-isiro-offline';
const STORE = 'mutations';
const EVENT = 'hospital-offline-queue';

interface QueuedMutation {
  id?: number;
  path: string;
  method: string;
  body?: string;
  idempotencyKey: string;
  createdAt: string;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

function changed() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export async function queueMutation(path: string, init: RequestInit) {
  const idempotencyKey = String(
    new Headers(init.headers).get('x-idempotency-key') ?? crypto.randomUUID(),
  );
  await withStore('readwrite', (store) =>
    store.add({
      path,
      method: init.method ?? 'POST',
      body: typeof init.body === 'string' ? init.body : undefined,
      idempotencyKey,
      createdAt: new Date().toISOString(),
    } satisfies QueuedMutation),
  );
  changed();
}

export async function pendingMutationCount() {
  return withStore('readonly', (store) => store.count());
}

async function reportConflict(row: QueuedMutation, error: ApiError) {
  let localPayload: Record<string, unknown> = {};
  try {
    localPayload = row.body ? (JSON.parse(row.body) as Record<string, unknown>) : {};
  } catch {
    localPayload = { rawBody: row.body };
  }
  await api('/clinical-safety/offline-conflicts', {
    method: 'POST',
    body: JSON.stringify({
      entityType: row.path,
      entityId: row.idempotencyKey,
      localPayload: {
        path: row.path,
        method: row.method,
        createdAt: row.createdAt,
        payload: localPayload,
      },
      serverPayload: {
        status: error.status,
        code: error.code,
        message: error.message,
        requestId: error.requestId,
        details: error.details,
      },
    }),
  });
}

export async function flushOfflineQueue() {
  if (!navigator.onLine) return { sent: 0, pending: await pendingMutationCount(), conflicts: 0 };
  const rows = await withStore<QueuedMutation[]>('readonly', (store) => store.getAll());
  let sent = 0;
  let conflicts = 0;
  for (const row of rows) {
    try {
      await api(row.path, {
        method: row.method,
        body: row.body,
        headers: { 'x-idempotency-key': row.idempotencyKey },
      });
      await withStore('readwrite', (store) => store.delete(row.id!));
      sent += 1;
    } catch (error) {
      if (error instanceof ApiError && [409, 422].includes(error.status)) {
        await reportConflict(row, error);
        await withStore('readwrite', (store) => store.delete(row.id!));
        conflicts += 1;
        continue;
      }
      break;
    }
  }
  changed();
  return { sent, pending: await pendingMutationCount(), conflicts };
}

export async function resilientApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method === 'GET') return api<T>(path, init);
  const mutation = {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      'x-idempotency-key': crypto.randomUUID(),
    },
  };
  if (!navigator.onLine) {
    await queueMutation(path, mutation);
    return { queued: true } as T;
  }
  try {
    return await api<T>(path, mutation);
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof ApiError && error.code === 'NETWORK_ERROR')
    ) {
      await queueMutation(path, mutation);
      return { queued: true } as T;
    }
    throw error;
  }
}

export const offlineQueueEvent = EVENT;
