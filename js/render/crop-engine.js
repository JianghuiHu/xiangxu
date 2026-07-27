import { clamp } from '../utils/geometry.js';

const RATIOS = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '21:9': 21 / 9
};

export function getCropSourceRect(source, crop) {
  if (!crop?.enabled) return { x: 0, y: 0, width: source.width, height: source.height };
  const zoom = clamp(Number(crop.zoom) || 1, 1, 5);
  let width;
  let height;
  const ratio = crop.mode === 'custom' ? clamp((Number(crop.customRatioWidth) || 1) / (Number(crop.customRatioHeight) || 1), .01, 100) : RATIOS[crop.mode];
  if (ratio) {
    if ((source.width / source.height) > ratio) {
      height = source.height / zoom;
      width = height * ratio;
    } else {
      width = source.width / zoom;
      height = width / ratio;
    }
  } else {
    width = source.width * clamp((Number(crop.freeWidth) || 100) / 100, 0.05, 1) / zoom;
    height = source.height * clamp((Number(crop.freeHeight) || 100) / 100, 0.05, 1) / zoom;
  }
  width = clamp(width, 1, source.width);
  height = clamp(height, 1, source.height);
  const centerX = clamp((Number(crop.x) || 0.5) * source.width, width / 2, source.width - (width / 2));
  const centerY = clamp((Number(crop.y) || 0.5) * source.height, height / 2, source.height - (height / 2));
  return { x: centerX - (width / 2), y: centerY - (height / 2), width, height };
}
