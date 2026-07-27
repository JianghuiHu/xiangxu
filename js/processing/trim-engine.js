import { clamp } from '../utils/geometry.js';

export function detectContentBounds(source, settings = {}) {
  const width = source.width;
  const height = source.height;
  if (!settings.enabled || !width || !height) return { x: 0, y: 0, width, height, empty: false };
  const scale = Math.min(1, 768 / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth; canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const target = hexToRgb(settings.color || '#ffffff');
  const tolerance = clamp(Number(settings.tolerance) || 0, 0, 255);
  const alphaThreshold = clamp(Number(settings.alphaThreshold) || 0, 0, 255);
  let left = sampleWidth; let top = sampleHeight; let right = -1; let bottom = -1;
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = ((y * sampleWidth) + x) * 4;
      const alpha = pixels[index + 3];
      const distance = Math.max(Math.abs(pixels[index] - target.r), Math.abs(pixels[index + 1] - target.g), Math.abs(pixels[index + 2] - target.b));
      const foreground = settings.mode === 'transparent' ? alpha > alphaThreshold : alpha > alphaThreshold && distance > tolerance;
      if (foreground) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
  }
  canvas.width = 1; canvas.height = 1;
  if (right < left || bottom < top) return { x: 0, y: 0, width, height, empty: true };
  const padding = Math.max(0, Number(settings.padding) || 0);
  const x = Math.max(0, (left / scale) - padding);
  const y = Math.max(0, (top / scale) - padding);
  const rightEdge = Math.min(width, ((right + 1) / scale) + padding);
  const bottomEdge = Math.min(height, ((bottom + 1) / scale) + padding);
  return { x, y, width: Math.max(1, rightEdge - x), height: Math.max(1, bottomEdge - y), empty: false };
}

function hexToRgb(hex) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  return { r: parseInt(normalized.slice(0, 2), 16), g: parseInt(normalized.slice(2, 4), 16), b: parseInt(normalized.slice(4, 6), 16) };
}
