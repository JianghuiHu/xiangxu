const DB_NAME = 'xiangxu-ai-models';
const STORE_NAME = 'models';

export const AI_MODEL_CATALOG = Object.freeze({
  ppmattingv2: {
    id: 'ppmattingv2',
    name: 'PP-MattingV2 人像版',
    version: 'PaddleSeg-2.7-stdc1-human-512',
    sizeHint: '34.3 MB',
    size: 35940680,
    checksum: '8286b1a110360e868d54ad00319aaa12d5e7bba79ee42e057d67fa5baa8962ff',
    inputShape: [1, 3, 512, 512],
    outputShape: [1, 1, 512, 512],
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5],
    outputMode: 'alpha',
    builtinUrl: new URL('../../assets/models/ppmattingv2-stdc1-human-512.onnx', import.meta.url).href,
    sourceUrl: 'https://paddleseg.bj.bcebos.com/matting/models/deploy/ppmattingv2-stdc1-human_512.zip'
  },
  u2netp: {
    id: 'u2netp',
    name: 'u2netp 通用版',
    version: 'rembg-v0.0.0',
    sizeHint: '约 4.4 MB',
    size: 4574861,
    checksum: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    inputShape: [1, 3, 320, 320],
    outputShape: [1, 1, 320, 320],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    outputMode: 'normalize',
    builtinUrl: new URL('../../assets/models/u2netp.onnx', import.meta.url).href,
    sourceUrl: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx'
  }
});

let runtimePromise;
const sessions = new Map();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? event.target.transaction.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.delete('u2netp');
      store.delete('u2net');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function requestStore(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function loadOrtRuntime() {
  if (!runtimePromise) {
    runtimePromise = import('../../vendor/onnxruntime-web/ort.wasm.bundle.min.mjs').then((ort) => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.logLevel = 'error';
      return ort;
    });
  }
  return runtimePromise;
}

export async function listInstalledModels() {
  const modelsById = new Map();
  const bundledCatalogs = Object.values(AI_MODEL_CATALOG).filter(({ builtinUrl }) => builtinUrl);
  const bundledAvailability = await Promise.all(bundledCatalogs.map((catalog) => isBundledModelAvailable(catalog)));
  try {
    const models = await requestStore('readonly', (store) => store.getAll());
    models.forEach(({ buffer, ...metadata }) => modelsById.set(metadata.id, metadata));
  } catch { /* IndexedDB 不可用时仍可使用实际存在的本地模型。 */ }
  bundledCatalogs.forEach((catalog, index) => {
    if (bundledAvailability[index]) modelsById.set(catalog.id, createBundledMetadata(catalog));
  });
  return [...modelsById.values()];
}

export async function getInstalledModel(id) {
  try {
    const stored = await requestStore('readonly', (store) => store.get(id));
    if (stored) return stored;
  } catch { /* 继续读取应用内置模型。 */ }
  const catalog = AI_MODEL_CATALOG[id];
  return catalog?.builtinUrl && await isBundledModelAvailable(catalog) ? loadBundledModel(catalog) : null;
}

export async function installModel(id, buffer, metadata = {}) {
  const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  if (bytes.byteLength < 1024) throw new Error('模型文件过小，不是有效的 ONNX 模型');
  const inspection = await inspectModelBuffer(bytes);
  const catalog = AI_MODEL_CATALOG[id];
  const checksum = await checksumBuffer(bytes);
  if (metadata.enforceChecksum && catalog?.checksum && checksum !== catalog.checksum) throw new Error(`${catalog.name} 文件校验失败，请重新下载`);
  const record = {
    id,
    name: catalog?.name || id,
    version: metadata.version || catalog?.version || 'custom',
    source: metadata.source || 'local',
    filename: metadata.filename || `${id}.onnx`,
    size: bytes.byteLength,
    checksum,
    installedAt: Date.now(),
    inputShape: inspection.inputShape,
    outputShape: inspection.outputShape,
    buffer: bytes
  };
  await requestStore('readwrite', (store) => store.put(record));
  await disposeSession(id);
  return { ...record, buffer: undefined };
}

export async function downloadAndInstallModel(id, onProgress = () => {}, { signal } = {}) {
  const catalog = AI_MODEL_CATALOG[id];
  if (!catalog) throw new Error('未知模型');
  if (!catalog.url) throw new Error(`${catalog.name} 不包含在源码发布中，请查看模型指南`);
  const response = await fetch(catalog.url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`模型下载失败：HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return installModel(id, await response.arrayBuffer(), { version: catalog.version, source: catalog.url, enforceChecksum: true });
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('模型下载已取消', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.byteLength;
      onProgress(total ? Math.round((received / total) * 85) : 20, received, total);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  onProgress(88, received, total);
  const result = await installModel(id, bytes, { version: catalog.version, source: catalog.url, filename: `${id}.onnx`, enforceChecksum: true });
  onProgress(100, received, total);
  return result;
}

export async function deleteModel(id) {
  await disposeSession(id);
  try { await requestStore('readwrite', (store) => store.delete(id)); }
  catch { /* 删除覆盖模型失败时仍可继续使用内置模型。 */ }
}

export async function getModelSession(id) {
  if (sessions.has(id)) return sessions.get(id);
  const record = await getInstalledModel(id);
  if (!record) throw new Error(`尚未安装 ${id} 模型`);
  const ort = await loadOrtRuntime();
  const session = await ort.InferenceSession.create(new Uint8Array(record.buffer), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  sessions.set(id, session);
  return session;
}

async function inspectModelBuffer(buffer) {
  const ort = await loadOrtRuntime();
  let session;
  try {
    session = await ort.InferenceSession.create(new Uint8Array(buffer), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const input = session.inputMetadata?.[0] || session.inputMetadata?.[session.inputNames[0]];
    const output = session.outputMetadata?.[0] || session.outputMetadata?.[session.outputNames[0]];
    const inputShape = input?.shape || input?.dimensions || [1, 3, 320, 320];
    const outputShape = output?.shape || output?.dimensions || [1, 1, 320, 320];
    if (inputShape.length !== 4) throw new Error('模型输入不是 NCHW 四维张量');
    return { inputShape, outputShape };
  } catch (error) {
    throw new Error(`模型检测失败：${error.message}`);
  } finally { await session?.release?.(); }
}

function createBundledMetadata(catalog) {
  return {
    id: catalog.id,
    name: catalog.name,
    version: catalog.version,
    source: 'bundled',
    filename: `${catalog.id}.onnx`,
    size: catalog.size,
    checksum: catalog.checksum,
    installedAt: 0,
    inputShape: catalog.inputShape,
    outputShape: catalog.outputShape,
    builtin: true
  };
}

async function loadBundledModel(catalog) {
  const response = await fetch(catalog.builtinUrl, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`内置 ${catalog.name} 模型缺失：HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const checksum = await checksumBuffer(buffer);
  if (buffer.byteLength !== catalog.size || checksum !== catalog.checksum) throw new Error(`内置 ${catalog.name} 模型校验失败`);
  return { ...createBundledMetadata(catalog), buffer };
}

async function isBundledModelAvailable(catalog) {
  if (!catalog?.builtinUrl) return false;
  if (catalog.builtinUrl.startsWith('file:')) return true;
  try {
    const response = await fetch(catalog.builtinUrl, { method: 'HEAD', cache: 'no-store' });
    if (response.ok) {
      const size = Number(response.headers.get('content-length')) || 0;
      return !size || size === catalog.size;
    }
  } catch { /* 某些本地静态服务器不支持 HEAD，继续使用轻量 GET 探测。 */ }
  try {
    const response = await fetch(catalog.builtinUrl, { method: 'GET', cache: 'no-store' });
    const size = Number(response.headers.get('content-length')) || 0;
    await response.body?.cancel();
    return response.ok && (!size || size === catalog.size);
  } catch {
    return false;
  }
}

async function checksumBuffer(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function disposeSession(id) {
  const session = sessions.get(id);
  sessions.delete(id);
  await session?.release?.();
}
