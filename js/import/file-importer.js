import { decodeImage } from './image-decoder.js?v=3';
import { filterSupportedFiles } from '../utils/validation.js';

export async function importFiles(files, startOrder = 0, onProgress = () => {}) {
  const { accepted, rejected } = filterSupportedFiles(Array.from(files));
  const images = [];
  const errors = rejected.map((file) => `${file.name}：不支持的文件格式`);
  for (let index = 0; index < accepted.length; index += 1) {
    try {
      images.push(await decodeImage(accepted[index], startOrder + index));
    } catch (error) {
      errors.push(error.message);
    }
    onProgress(index + 1, accepted.length);
  }
  return { images, errors, rejectedCount: rejected.length };
}

async function readEntry(entry, output) {
  if (entry.isFile) {
    await new Promise((resolve) => entry.file((file) => { output.push(file); resolve(); }, resolve));
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((resolve) => reader.readEntries(resolve));
      for (const child of batch) await readEntry(child, output);
    } while (batch.length);
  }
}

export async function filesFromDataTransfer(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Array.from(dataTransfer.files || []);
  const files = [];
  for (const entry of entries) await readEntry(entry, files);
  return files;
}
