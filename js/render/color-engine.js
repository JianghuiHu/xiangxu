import { clamp } from '../utils/geometry.js';

export function createColorProcessedSource(source, settings = {}) {
  if (!settings.enabled || settings.mode === 'none') return { source, dispose() {} };
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const from = hexToRgb(settings.source);
  const to = hexToRgb(settings.target);
  const tolerance = clamp(Number(settings.tolerance) || 0, 0, 255);
  const brightness = (Number(settings.brightness) || 100) / 100;
  const contrast = (Number(settings.contrast) || 100) / 100;
  const saturation = (Number(settings.saturation) || 100) / 100;
  const opacity = (Number(settings.opacity) || 100) / 100;
  for (let index = 0; index < data.length; index += 4) {
    if (!data[index + 3]) continue;
    let r = data[index]; let g = data[index + 1]; let b = data[index + 2];
    const distance = Math.max(Math.abs(r - from.r), Math.abs(g - from.g), Math.abs(b - from.b));
    if (settings.mode === 'replace' && distance <= tolerance) { r = to.r; g = to.g; b = to.b; }
    if (settings.mode === 'colorToTransparent' && distance <= tolerance) data[index + 3] = 0;
    if (settings.mode === 'grayscale') { const gray = Math.round((r * .2126) + (g * .7152) + (b * .0722)); r = gray; g = gray; b = gray; }
    if (settings.mode === 'invert') { r = 255 - r; g = 255 - g; b = 255 - b; }
    const gray = (r + g + b) / 3;
    r = (((r - 128) * contrast) + 128) * brightness; g = (((g - 128) * contrast) + 128) * brightness; b = (((b - 128) * contrast) + 128) * brightness;
    r = gray + ((r - gray) * saturation); g = gray + ((g - gray) * saturation); b = gray + ((b - gray) * saturation);
    data[index] = clamp(Math.round(r), 0, 255); data[index + 1] = clamp(Math.round(g), 0, 255); data[index + 2] = clamp(Math.round(b), 0, 255); data[index + 3] = clamp(Math.round(data[index + 3] * opacity), 0, 255);
  }
  context.putImageData(image, 0, 0);
  return { source: canvas, dispose() { canvas.width = 1; canvas.height = 1; } };
}

function hexToRgb(hex = '#ffffff') {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}
