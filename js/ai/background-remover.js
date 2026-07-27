import { AI_MODEL_CATALOG, getModelSession, loadOrtRuntime } from './model-manager.js?v=5';
import { adjustMask } from './mask-adjustments.js?v=1';

const maskCache = new Map();
const pendingMasks = new Map();
const MAX_CACHED_MASKS = 8;

export function clearAiMaskCache(modelId = '') {
  if (!modelId) { maskCache.clear(); pendingMasks.clear(); return; }
  for (const key of maskCache.keys()) if (key.endsWith(`:${modelId}`)) maskCache.delete(key);
}

export async function removeBackgroundWithAi(source, settings, onProgress = () => {}, sourceKey = '', edits = null) {
  const cacheKey = sourceKey ? `${sourceKey}:${settings.modelId}` : '';
  const cached = cacheKey ? maskCache.get(cacheKey) : null;
  let mask = cached;
  if (!mask) {
    onProgress(5, '检查本地模型');
    await nextFrame();
    if (cacheKey && pendingMasks.has(cacheKey)) mask = await pendingMasks.get(cacheKey);
    else {
      const task = createMask(source, settings.modelId, onProgress);
      if (cacheKey) pendingMasks.set(cacheKey, task);
      try { mask = await task; }
      finally { if (cacheKey) pendingMasks.delete(cacheKey); }
      if (cacheKey) rememberMask(cacheKey, mask);
    }
  }
  if (!cached) onProgress(90, '合成透明背景');
  const result = composeResult(source, mask, settings, edits);
  if (!cached) onProgress(100, '抠图完成');
  return result;
}

async function createMask(source, modelId, onProgress) {
  const model = AI_MODEL_CATALOG[modelId];
  if (!model) throw new Error('当前预设引用了已移除的模型，请重新选择 PP-MattingV2');
  onProgress(10, '加载本地模型');
  const session = await getModelSession(modelId);
  const ort = await loadOrtRuntime();
  const inputMeta = session.inputMetadata?.[0] || session.inputMetadata?.[session.inputNames[0]];
  const shape = inputMeta?.shape || inputMeta?.dimensions || [1, 3, 320, 320];
  const height = positiveDimension(shape[2], 320);
  const width = positiveDimension(shape[3], 320);
  onProgress(24, '准备图片数据');
  await nextFrame();
  const input = prepareInput(source, width, height, model);
  onProgress(38, '本地 AI 正在生成 Mask');
  await nextFrame();
  const outputMap = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, height, width]) });
  const output = outputMap[session.outputNames[0]] || Object.values(outputMap)[0];
  if (!output?.data?.length) throw new Error('模型没有返回有效 Mask');
  onProgress(82, '优化主体边缘');
  await nextFrame();
  return normalizeMask(output, model.outputMode);
}

function normalizeMask(output, outputMode = 'alpha') {
  const width = positiveDimension(output.dims?.at(-1), 320);
  const height = positiveDimension(output.dims?.at(-2), 320);
  const length = Math.min(width * height, output.data.length);
  const data = new Float32Array(length);
  if (outputMode === 'alpha') {
    for (let index = 0; index < length; index += 1) data[index] = Math.min(1, Math.max(0, output.data[index]));
  } else {
    let min = Number.POSITIVE_INFINITY; let max = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < length; index += 1) { min = Math.min(min, output.data[index]); max = Math.max(max, output.data[index]); }
    const range = Math.max(1e-6, max - min);
    for (let index = 0; index < length; index += 1) data[index] = (output.data[index] - min) / range;
  }
  return { width, height, data };
}

function rememberMask(key, mask) {
  maskCache.delete(key);
  maskCache.set(key, mask);
  while (maskCache.size > MAX_CACHED_MASKS) maskCache.delete(maskCache.keys().next().value);
}

function prepareInput(source, width, height, model) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  const means = model.mean || [0.5, 0.5, 0.5];
  const stds = model.std || [0.5, 0.5, 0.5];
  for (let index = 0; index < plane; index += 1) {
    tensor[index] = (pixels[index * 4] / 255 - means[0]) / stds[0];
    tensor[plane + index] = (pixels[index * 4 + 1] / 255 - means[1]) / stds[1];
    tensor[plane * 2 + index] = (pixels[index * 4 + 2] / 255 - means[2]) / stds[2];
  }
  canvas.width = 1; canvas.height = 1;
  return tensor;
}

function composeResult(source, mask, settings, edits) {
  const outputWidth = mask.width;
  const outputHeight = mask.height;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = outputWidth; maskCanvas.height = outputHeight;
  const maskContext = maskCanvas.getContext('2d');
  const imageData = maskContext.createImageData(outputWidth, outputHeight);
  const length = Math.min(outputWidth * outputHeight, mask.data.length);
  const threshold = Number(settings.threshold) || 0.5;
  const softness = Math.max(0.001, Number(settings.softness) || 0.001);
  const thresholded = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    thresholded[index] = smoothstep(threshold - softness, threshold + softness, mask.data[index]);
  }
  const adjusted = adjustMask({ width: outputWidth, height: outputHeight, data: thresholded }, settings, edits, { width: source.width, height: source.height });
  for (let index = 0; index < length; index += 1) {
    const alpha = adjusted.data[index];
    imageData.data[index * 4] = 255; imageData.data[index * 4 + 1] = 255; imageData.data[index * 4 + 2] = 255; imageData.data[index * 4 + 3] = Math.round(alpha * 255);
  }
  maskContext.putImageData(imageData, 0, 0);
  const result = document.createElement('canvas');
  result.width = source.width; result.height = source.height;
  const context = result.getContext('2d');
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(maskCanvas, 0, 0, result.width, result.height);
  context.globalCompositeOperation = 'source-over';
  maskCanvas.width = 1; maskCanvas.height = 1;
  return result;
}

function smoothstep(edge0, edge1, value) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function positiveDimension(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
