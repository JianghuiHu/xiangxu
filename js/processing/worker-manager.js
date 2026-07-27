export async function hashFilesInWorker(files) {
  if (!('Worker' in window)) return Promise.all(files.map(fileHash));
  const worker = new Worker(new URL('../../workers/image-worker.js', import.meta.url), { type: 'module' });
  const id = crypto.randomUUID();
  try {
    return await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('文件哈希 Worker 超时')), 30000);
      worker.addEventListener('message', (event) => {
        if (event.data?.id !== id) return;
        window.clearTimeout(timeout);
        if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.hashes);
      });
      worker.addEventListener('error', (event) => { window.clearTimeout(timeout); reject(new Error(event.message || '文件哈希 Worker 崩溃')); });
      worker.postMessage({ id, type: 'hash-files', files });
    });
  } catch {
    return Promise.all(files.map(fileHash));
  } finally { worker.terminate(); }
}

async function fileHash(file) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
