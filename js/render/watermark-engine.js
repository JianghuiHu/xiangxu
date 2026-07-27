import { alignmentFactors } from '../utils/geometry.js';

export function renderTextWatermark(context, width, height, settings = {}, scale = 1) {
  if (!settings.enabled) return;
  if (settings.type === 'image') return renderImageWatermark(context, width, height, settings, scale);
  if (!settings.text) return;
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, (Number(settings.opacity) || 0) / 100));
  context.fillStyle = settings.color || '#ffffff';
  context.font = `${Number(settings.weight) || 600} ${Math.max(8, (Number(settings.fontSize) || 32) * scale)}px "Microsoft YaHei UI", sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle';
  const metrics = context.measureText(settings.text);
  const spacingX = metrics.width + (80 * scale); const spacingY = (Number(settings.fontSize) + 70) * scale;
  if (settings.tiled) {
    context.translate(width / 2, height / 2); context.rotate((Number(settings.rotation) || 0) * Math.PI / 180);
    for (let y = -height; y <= height; y += spacingY) for (let x = -width; x <= width; x += spacingX) context.fillText(settings.text, x, y);
  } else {
    const factor = alignmentFactors(settings.alignment);
    const margin = (Number(settings.margin) || 0) * scale;
    const x = margin + (metrics.width / 2) + ((width - (margin * 2) - metrics.width) * factor.horizontal);
    const y = margin + ((Number(settings.fontSize) || 32) * scale / 2) + ((height - (margin * 2) - ((Number(settings.fontSize) || 32) * scale)) * factor.vertical);
    context.translate(x, y); context.rotate((Number(settings.rotation) || 0) * Math.PI / 180); context.fillText(settings.text, 0, 0);
  }
  context.restore();
}

const imageCache = new Map();

export function preloadWatermarkImage(dataUrl) {
  if (!dataUrl) return Promise.resolve(null);
  const existing = imageCache.get(dataUrl);
  if (existing?.complete) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const image = existing || new Image(); imageCache.set(dataUrl, image);
    image.onload = () => resolve(image); image.onerror = () => reject(new Error('水印图片解码失败')); image.src = dataUrl;
  });
}

function renderImageWatermark(context, width, height, settings, scale) {
  const image = imageCache.get(settings.imageDataUrl);
  if (!image?.complete || !image.naturalWidth) return;
  const targetWidth = width * Math.max(.01, Math.min(1, (Number(settings.imageScale) || 20) / 100));
  const targetHeight = targetWidth * (image.naturalHeight / image.naturalWidth);
  const factor = alignmentFactors(settings.alignment); const margin = (Number(settings.margin) || 0) * scale;
  const x = margin + ((width - (margin * 2) - targetWidth) * factor.horizontal);
  const y = margin + ((height - (margin * 2) - targetHeight) * factor.vertical);
  context.save(); context.globalAlpha = Math.max(0, Math.min(1, (Number(settings.opacity) || 0) / 100));
  if (settings.tiled) for (let row = -targetHeight; row < height; row += targetHeight + margin) for (let column = -targetWidth; column < width; column += targetWidth + margin) context.drawImage(image, column, row, targetWidth, targetHeight);
  else context.drawImage(image, x, y, targetWidth, targetHeight);
  context.restore();
}
