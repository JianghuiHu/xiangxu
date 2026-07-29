import { clamp } from '../utils/geometry.js';

export function createColorProcessedSource(source, settings = {}) {
  if (!settings.enabled) return { source, dispose() {} };
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  processColorPixels(image.data, settings);
  context.putImageData(image, 0, 0);
  return { source: canvas, dispose() { canvas.width = 1; canvas.height = 1; } };
}

export function processColorPixels(data, settings = {}) {
  if (!settings.enabled) return data;
  const from = hexToRgb(settings.source);
  const to = hexToRgb(settings.target);
  const tolerance = clamp(numberOr(settings.tolerance, 0), 0, 255);
  const brightness = clamp(numberOr(settings.brightness, 100), 0, 200) / 100;
  const contrast = clamp(numberOr(settings.contrast, 100), 0, 200) / 100;
  const saturation = clamp(numberOr(settings.saturation, 100), 0, 200) / 100;
  const opacity = clamp(numberOr(settings.opacity, 100), 0, 100) / 100;
  const exposure = 2 ** clamp(numberOr(settings.exposure, 0), -3, 3);
  const temperature = clamp(numberOr(settings.temperature, 0), -100, 100);
  const tint = clamp(numberOr(settings.tint, 0), -100, 100);
  const hue = clamp(numberOr(settings.hue, 0), -180, 180);
  const curves = settings.curves || {};
  for (let index = 0; index < data.length; index += 4) {
    if (!data[index + 3]) continue;
    let r = data[index]; let g = data[index + 1]; let b = data[index + 2];
    const distance = Math.max(Math.abs(r - from.r), Math.abs(g - from.g), Math.abs(b - from.b));
    if (settings.mode === 'replace' && distance <= tolerance) { r = to.r; g = to.g; b = to.b; }
    if (settings.mode === 'colorToTransparent' && distance <= tolerance) data[index + 3] = 0;
    if (settings.mode === 'grayscale') { const gray = Math.round((r * .2126) + (g * .7152) + (b * .0722)); r = gray; g = gray; b = gray; }
    if (settings.mode === 'invert') { r = 255 - r; g = 255 - g; b = 255 - b; }

    if (settings.mode === 'none') {
      r += (temperature * .45) + (tint * .12);
      g -= tint * .32;
      b += (-temperature * .45) + (tint * .12);
      if (hue) [r, g, b] = rotateHue(r, g, b, hue);
      r = (((r - 128) * contrast) + 128) * brightness * exposure;
      g = (((g - 128) * contrast) + 128) * brightness * exposure;
      b = (((b - 128) * contrast) + 128) * brightness * exposure;
      const gray = (r * .2126) + (g * .7152) + (b * .0722);
      r = gray + ((r - gray) * saturation); g = gray + ((g - gray) * saturation); b = gray + ((b - gray) * saturation);
      r = applyToneCurve(applyToneCurve(r, curves.rgb), curves.r);
      g = applyToneCurve(applyToneCurve(g, curves.rgb), curves.g);
      b = applyToneCurve(applyToneCurve(b, curves.rgb), curves.b);
      data[index + 3] = clamp(Math.round(data[index + 3] * opacity), 0, 255);
    }
    data[index] = clamp(Math.round(r), 0, 255);
    data[index + 1] = clamp(Math.round(g), 0, 255);
    data[index + 2] = clamp(Math.round(b), 0, 255);
  }
  return data;
}

export function applyToneCurve(value, curve = {}) {
  const normalized = clamp(Number(value) || 0, 0, 255) / 255;
  const shadows = clamp(Number(curve?.shadows) || 0, -100, 100) / 100;
  const midtones = clamp(Number(curve?.midtones) || 0, -100, 100) / 100;
  const highlights = clamp(Number(curve?.highlights) || 0, -100, 100) / 100;
  const shadowWeight = (1 - normalized) ** 2;
  const midtoneWeight = 4 * normalized * (1 - normalized);
  const highlightWeight = normalized ** 2;
  const delta = ((shadows * shadowWeight) + (midtones * midtoneWeight) + (highlights * highlightWeight)) * .25;
  return clamp((normalized + delta) * 255, 0, 255);
}

export function createCurveSvgPath(curve = {}) {
  const points = [];
  for (let x = 0; x <= 100; x += 2) {
    const y = applyToneCurve((x / 100) * 255, curve) / 255;
    points.push(`${x},${Math.round((100 - (y * 100)) * 100) / 100}`);
  }
  return points.join(' ');
}

function hexToRgb(hex = '#ffffff') {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function rotateHue(r, g, b, degrees) {
  const angle = degrees * (Math.PI / 180);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    ((.213 + (cosine * .787) - (sine * .213)) * r) + ((.715 - (cosine * .715) - (sine * .715)) * g) + ((.072 - (cosine * .072) + (sine * .928)) * b),
    ((.213 - (cosine * .213) + (sine * .143)) * r) + ((.715 + (cosine * .285) + (sine * .140)) * g) + ((.072 - (cosine * .072) - (sine * .283)) * b),
    ((.213 - (cosine * .213) - (sine * .787)) * r) + ((.715 - (cosine * .715) + (sine * .715)) * g) + ((.072 + (cosine * .928) + (sine * .072)) * b)
  ];
}
