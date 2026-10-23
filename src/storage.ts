import { newProject, validateProject, type Project } from './model';

const PROJECT_KEY = 'frameflow-project-v1';
const DB_NAME = 'frameflow-media-v1';
const STORE = 'blobs';

export function loadProject(): Project {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (validateProject(parsed)) return parsed;
    }
  } catch { /* storage can be unavailable */ }
  return newProject();
}

export function saveProject(project: Project): boolean {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify({ ...project, updatedAt: new Date().toISOString() }));
    return true;
  } catch { return false; }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    action(tx.objectStore(STORE), resolve, reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export function putBlob(id: string, blob: Blob): Promise<void> {
  return transaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function getBlob(id: string): Promise<Blob | undefined> {
  return transaction<Blob | undefined>('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
}

export function deleteBlob(id: string): Promise<void> {
  return transaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
