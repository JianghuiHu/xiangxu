import { getOutputSize, renderCanvasPipeline } from '../render/canvas-pipeline.js?v=7';
import { removeBackgroundWithAi } from '../ai/background-remover.js?v=8';

const MIME_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

export async function renderImageForExport(imageRecord, settings) {
  const bitmap = await decodeExportSource(imageRecord);
  let aiCanvas = null;
  try {
    const exportSettings = structuredClone(settings);
    if (exportSettings.ai?.enabled) aiCanvas = await removeBackgroundWithAi(bitmap, exportSettings.ai, () => {}, imageRecord.id, imageRecord.aiMaskEdits);
    const source = aiCanvas || bitmap;
    const dimensions = getOutputSize(source, exportSettings);
    if (settings.output.format === 'jpeg') {
      exportSettings.canvas.enabled = true;
      exportSettings.canvas.width = dimensions.width;
      exportSettings.canvas.height = dimensions.height;
      exportSettings.canvas.background = { type: 'solid', color: settings.output.jpegBackground };
    }
    const canvas = document.createElement('canvas');
    const result = renderCanvasPipeline(canvas, source, exportSettings, { maxDimension: Number.POSITIVE_INFINITY });
    const mime = MIME_TYPES[settings.output.format];
    const quality = settings.output.format === 'png' ? undefined : settings.output.quality / 100;
    const encoded = settings.compression?.targetEnabled
      ? await encodeToTarget(canvas, mime, quality, settings.compression)
      : { blob: await canvasToBlob(canvas, mime, quality), width: canvas.width, height: canvas.height, quality: settings.output.quality, reached: true };
    canvas.width = 1;
    canvas.height = 1;
    return { blob: encoded.blob, width: encoded.width, height: encoded.height, mime, quality: encoded.quality, targetReached: encoded.reached };
  } finally {
    bitmap.close?.();
    if (aiCanvas) { aiCanvas.width = 1; aiCanvas.height = 1; }
  }
}

export function getRuntimeHost() {
  if (globalThis.window?.pywebview?.api) return 'desktop';
  if (globalThis.location?.search && new URLSearchParams(globalThis.location.search).has('verified')) return 'embedded';
  const userAgent = globalThis.navigator?.userAgent || '';
  if (/Codex|Electron|WebView|\bwv\b/i.test(userAgent)) return 'embedded';
  return 'browser';
}

export async function downloadBlob(blob, filename) {
  if (getRuntimeHost() === 'desktop' && window.pywebview.api.begin_save) {
    return saveWithDesktopBridge(blob, filename);
  }
  const url = URL.createObjectURL(blob);
  window.dispatchEvent(new CustomEvent('xiangxu:download-ready', { detail: { url, filename, size: blob.size } }));
  return { mode: 'manual', filename, size: blob.size };
}

async function saveWithDesktopBridge(blob, filename) {
  const started = await window.pywebview.api.begin_save(filename);
  if (!started?.token) return { mode: 'desktop', cancelled: true };
  try {
    const chunkSize = 512 * 1024;
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const buffer = await blob.slice(offset, Math.min(blob.size, offset + chunkSize)).arrayBuffer();
      const encoded = bytesToBase64(new Uint8Array(buffer));
      await window.pywebview.api.append_save_chunk(started.token, encoded);
    }
    const completed = await window.pywebview.api.finish_save(started.token);
    return { mode: 'desktop', path: completed?.path || started.path, filename, size: blob.size };
  } catch (error) {
    await window.pywebview.api.cancel_save(started.token).catch(() => {});
    throw error;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function canvasToBlob(canvas, mime, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error(`浏览器无法编码 ${mime}`);
  if (blob.type !== mime) throw new Error(`当前浏览器不支持 ${mime} 编码`);
  return blob;
}

async function encodeToTarget(sourceCanvas, mime, initialQuality, settings) {
  const target = Math.max(1, Number(settings.targetKB) || 1) * 1024;
  let canvas = sourceCanvas;
  let best = null;
  const lossy = mime === 'image/jpeg' || mime === 'image/webp';
  for (let resizeAttempt = 0; resizeAttempt < (settings.allowResize ? 7 : 1); resizeAttempt += 1) {
    if (lossy) {
      let low = Math.max(.01, (Number(settings.minQuality) || 1) / 100);
      let high = Math.max(low, initialQuality || .9);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const quality = (low + high) / 2;
        const blob = await canvasToBlob(canvas, mime, quality);
        if (blob.size <= target) { best = { blob, width: canvas.width, height: canvas.height, quality: Math.round(quality * 100), reached: true }; low = quality; }
        else high = quality;
      }
      if (best) break;
    } else {
      const blob = await canvasToBlob(canvas, mime);
      if (blob.size <= target) { best = { blob, width: canvas.width, height: canvas.height, quality: 100, reached: true }; break; }
    }
    if (!settings.allowResize) break;
    const reduced = document.createElement('canvas');
    reduced.width = Math.max(1, Math.round(canvas.width * .86)); reduced.height = Math.max(1, Math.round(canvas.height * .86));
    reduced.getContext('2d').drawImage(canvas, 0, 0, reduced.width, reduced.height);
    if (canvas !== sourceCanvas) { canvas.width = 1; canvas.height = 1; }
    canvas = reduced;
  }
  if (!best) {
    const fallbackQuality = lossy ? Math.max(.01, (Number(settings.minQuality) || 1) / 100) : undefined;
    const blob = await canvasToBlob(canvas, mime, fallbackQuality);
    best = { blob, width: canvas.width, height: canvas.height, quality: lossy ? Math.round(fallbackQuality * 100) : 100, reached: blob.size <= target };
  }
  if (canvas !== sourceCanvas) { canvas.width = 1; canvas.height = 1; }
  return best;
}

async function decodeExportSource(imageRecord) {
  try { return await createImageBitmap(imageRecord.file); }
  catch {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('浏览器无法解码此图片用于导出'));
      image.src = imageRecord.objectUrl;
    });
  }
}
