function decodeWithImage(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('浏览器无法解码此图片'));
    image.src = objectUrl;
  });
}

async function detectAlpha(file, objectUrl, width, height) {
  if (file.type === 'image/jpeg' || file.type === 'image/bmp') return false;
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const sampleWidth = Math.min(width, 256);
    const sampleHeight = Math.min(height, 256);
    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) return true;
    return false;
  } catch {
    return null;
  }
}

export async function decodeImage(file, importOrder) {
  const objectUrl = URL.createObjectURL(file);
  try {
    let dimensions;
    try {
      const bitmap = await createImageBitmap(file);
      dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch {
      dimensions = await decodeWithImage(objectUrl);
    }
    const alpha = await detectAlpha(file, objectUrl, dimensions.width, dimensions.height);
    const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const animatedWebP = extension === 'webp' && await isAnimatedWebP(file);
    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      extension,
      mime: file.type || `image/${extension}`,
      width: dimensions.width,
      height: dimensions.height,
      size: file.size,
      hasAlpha: alpha,
      objectUrl,
      status: 'pending',
      overrides: null,
      settingsMode: 'global',
      customSettings: null,
      aiMaskEdits: { strokes: [] },
      renderDirty: true,
      error: null,
      importOrder,
      warning: extension === 'gif' || animatedWebP ? '动画格式仅处理第一帧' : null
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new Error(`${file.name}：${error.message}`);
  }
}

async function isAnimatedWebP(file) {
  try {
    const bytes = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
    for (let index = 12; index <= bytes.length - 4; index += 1) if (bytes[index] === 65 && bytes[index + 1] === 78 && bytes[index + 2] === 73 && bytes[index + 3] === 77) return true;
  } catch { /* 保持可导入，无法检测时不阻断。 */ }
  return false;
}
