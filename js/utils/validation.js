import { SUPPORTED_TYPES } from '../state/defaults.js';
import { extensionOf } from './format.js';

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'gif']);

export function isSupportedImage(file) {
  return file instanceof File && (SUPPORTED_TYPES.has(file.type) || SUPPORTED_EXTENSIONS.has(extensionOf(file.name)));
}

export function filterSupportedFiles(files) {
  const accepted = [];
  const rejected = [];
  for (const file of files) (isSupportedImage(file) ? accepted : rejected).push(file);
  return { accepted, rejected };
}
