const DB_NAME = 'xiangxu-export-targets';
const STORE_NAME = 'handles';
const DEFAULT_KEY = 'default-export-directory';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadExportDirectoryHandle() {
  try { return await withStore('readonly', (store) => store.get(DEFAULT_KEY)); }
  catch { return null; }
}

export async function saveExportDirectoryHandle(handle) {
  try { await withStore('readwrite', (store) => store.put(handle, DEFAULT_KEY)); return true; }
  catch { return false; }
}

export async function clearExportDirectoryHandle() {
  try { await withStore('readwrite', (store) => store.delete(DEFAULT_KEY)); }
  catch { /* 浏览器不支持持久化 FileSystemHandle 时仅保留当前会话 */ }
}

export async function ensureDirectoryPermission(handle) {
  if (!handle) return false;
  const options = { mode: 'readwrite' };
  if (await handle.queryPermission?.(options) === 'granted') return true;
  return await handle.requestPermission?.(options) === 'granted';
}
