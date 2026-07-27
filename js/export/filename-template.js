const EXTENSIONS = { png: 'png', jpeg: 'jpg', webp: 'webp' };

export function formatFilename(image, output, dimensions, sequence, presetName = '未命名任务') {
  const now = new Date();
  const baseName = image.name.replace(/\.[^.]+$/, '');
  const extension = EXTENSIONS[output.format] || output.format;
  const values = {
    原文件名: baseName,
    序号: String(sequence).padStart(output.sequenceDigits, '0'),
    宽度: dimensions.width,
    高度: dimensions.height,
    比例: simplifyRatio(dimensions.width, dimensions.height),
    格式: extension,
    日期: datePart(now),
    时间: timePart(now),
    预设名称: presetName
  };
  let filename = output.filenameTemplate.replace(/\{([^}]+)\}/g, (match, key) => key in values ? values[key] : match);
  filename = sanitizeFilename(filename).replace(/\.+$/, '') || `image_${values.序号}`;
  return `${filename}.${extension}`;
}

export function resolveDuplicateFilename(filename, usedNames) {
  let candidate = filename;
  let suffix = 2;
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  while (usedNames.has(candidate.toLocaleLowerCase())) candidate = `${base}_${suffix++}${extension}`;
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

function sanitizeFilename(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
}

function datePart(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('');
}

function timePart(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join('');
}

function simplifyRatio(width, height) {
  let a = Math.round(width);
  let b = Math.round(height);
  while (b) [a, b] = [b, a % b];
  return `${Math.round(width) / a}:${Math.round(height) / a}`;
}
