import { clamp } from '../utils/geometry.js';

export function applyMaskPath(context, width, height, mask) {
  const type = mask?.enabled ? mask.type : 'rectangle';
  context.beginPath();
  if (type === 'circle') {
    const size = Math.min(width, height);
    context.arc(width / 2, height / 2, size / 2, 0, Math.PI * 2);
    return { type, x: (width - size) / 2, y: (height - size) / 2, width: size, height: size, radius: size / 2 };
  }
  if (type === 'ellipse') {
    context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    return { type, x: 0, y: 0, width, height, radius: Math.min(width, height) / 2 };
  }
  if (type === 'square') {
    const size = Math.min(width, height);
    const x = (width - size) / 2;
    const y = (height - size) / 2;
    context.rect(x, y, size, size);
    return { type, x, y, width: size, height: size, radius: 0 };
  }
  const radius = type === 'capsule'
    ? Math.min(width, height) / 2
    : type === 'rounded' ? clamp(Number(mask.radius) || 0, 0, Math.min(width, height) / 2) : 0;
  roundedRect(context, 0, 0, width, height, radius);
  return { type, x: 0, y: 0, width, height, radius };
}

function roundedRect(context, x, y, width, height, radius) {
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
