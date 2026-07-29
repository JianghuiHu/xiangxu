import { alignRect, clamp, fitRect } from '../utils/geometry.js';
import { renderBackground } from './background-engine.js';
import { getCropSourceRect } from './crop-engine.js?v=2';
import { applyMaskPath } from './mask-engine.js';
import { detectContentBounds } from '../processing/trim-engine.js';
import { createColorProcessedSource } from './color-engine.js?v=4';
import { renderTextWatermark } from './watermark-engine.js';

const MAX_PREVIEW_DIMENSION = 2048;

export function getOutputSize(source, settings) {
  if (settings.canvas.enabled) {
    return { width: validDimension(settings.canvas.width), height: validDimension(settings.canvas.height) };
  }
  if (settings.resize.enabled) {
    return { width: validDimension(settings.resize.width), height: validDimension(settings.resize.height) };
  }
  if (settings.crop.enabled) {
    const crop = effectiveSourceRect(source, settings);
    return { width: validDimension(crop.width), height: validDimension(crop.height) };
  }
  if (settings.trim?.enabled && isDrawableSource(source)) {
    const trim = detectContentBounds(source, settings.trim);
    return { width: validDimension(trim.width), height: validDimension(trim.height) };
  }
  return { width: source.width, height: source.height };
}

export function renderCanvasPipeline(canvas, bitmap, settings, options = {}) {
  const output = getOutputSize(bitmap, settings);
  const maximumDimension = options.maxDimension ?? MAX_PREVIEW_DIMENSION;
  const previewScale = Math.min(1, maximumDimension / Math.max(output.width, output.height));
  const width = Math.max(1, Math.round(output.width * previewScale));
  const height = Math.max(1, Math.round(output.height * previewScale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = settings.resize.quality !== 'low';
  context.imageSmoothingQuality = settings.resize.quality === 'medium' ? 'medium' : 'high';
  const scaledBackground = settings.canvas.enabled ? settings.canvas.background : { type: 'transparent', color: '#ffffff' };
  const sourceRect = effectiveSourceRect(bitmap, settings);
  const colorSource = createColorProcessedSource(bitmap, settings.color);
  context.save();
  const mask = applyMaskPath(context, width, height, settings.mask);
  context.clip();
  renderBackground(context, width, height, scaledBackground);

  const margin = clamp(Number(settings.position.margin) || 0, 0, Math.max(0, Math.min(output.width, output.height) / 2)) * previewScale;
  const inner = { x: margin, y: margin, width: Math.max(1, width - (margin * 2)), height: Math.max(1, height - (margin * 2)) };
  const normalized = settings.subject?.enabled;
  const pixelWidthLimit = settings.resize.enabled ? settings.resize.width * previewScale : Number.POSITIVE_INFINITY;
  const pixelHeightLimit = settings.resize.enabled ? settings.resize.height * previewScale : Number.POSITIVE_INFINITY;
  const relativeWidthLimit = normalized ? inner.width * ((Number(settings.subject.widthPercent) || 80) / 100) : Number.POSITIVE_INFINITY;
  const relativeHeightLimit = normalized ? inner.height * ((Number(settings.subject.heightPercent) || 72) / 100) : Number.POSITIVE_INFINITY;
  const desiredWidth = Math.min(inner.width, pixelWidthLimit, relativeWidthLimit);
  const desiredHeight = Math.min(inner.height, pixelHeightLimit, relativeHeightLimit);
  const alignment = settings.position.alignment;
  const contentBox = alignRect(inner, desiredWidth, desiredHeight, alignment);
  const mode = normalized ? 'contain' : (settings.resize.enabled ? settings.resize.mode : 'contain');
  const draw = fitRect(
    sourceRect.width,
    sourceRect.height,
    contentBox,
    mode,
    alignment,
    (Number(settings.position.offsetX) || 0) * previewScale,
    (Number(settings.position.offsetY) || 0) * previewScale
  );

  context.save();
  context.beginPath();
  context.rect(inner.x, inner.y, inner.width, inner.height);
  context.clip();
  context.drawImage(colorSource.source, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, draw.x, draw.y, draw.width, draw.height);
  context.restore();
  renderTextWatermark(context, width, height, settings.watermark, previewScale);
  context.restore();
  colorSource.dispose();
  const probePoints = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], [Math.floor(width / 2), Math.floor(height / 2)]];
  const rgbaProbe = probePoints.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
  const alphaProbe = rgbaProbe.map((rgba) => rgba[3]);
  return { outputWidth: output.width, outputHeight: output.height, previewWidth: width, previewHeight: height, drawRect: draw, sourceRect, mask, alphaProbe, rgbaProbe };
}

function effectiveSourceRect(source, settings) {
  const base = settings.trim?.enabled && isDrawableSource(source) ? detectContentBounds(source, settings.trim) : { x: 0, y: 0, width: source.width, height: source.height };
  if (!settings.crop.enabled) return base;
  const crop = getCropSourceRect({ width: base.width, height: base.height }, settings.crop);
  return { x: base.x + crop.x, y: base.y + crop.y, width: crop.width, height: crop.height };
}

function isDrawableSource(source) {
  return typeof source?.close === 'function' || source instanceof HTMLImageElement || source instanceof HTMLCanvasElement || source instanceof SVGImageElement;
}

function validDimension(value) {
  return clamp(Math.round(Number(value) || 1), 1, 16384);
}
