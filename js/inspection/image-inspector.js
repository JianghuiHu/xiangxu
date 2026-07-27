import { hashFilesInWorker } from '../processing/worker-manager.js';

export async function inspectImages(images, settings, rules, getSettings = null) {
  const results = [];
  const hashes = new Map();
  const visualHashes = [];
  const fileHashes = await hashFilesInWorker(images.map((image) => image.file));
  for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
    const image = images[imageIndex];
    const effectiveSettings = getSettings ? getSettings(image.id) : settings;
    const issues = [];
    if (image.size > rules.maxKB * 1024) issues.push(issue('warning', `文件体积超过 ${rules.maxKB}KB`));
    if (image.width < rules.minWidth || image.height < rules.minHeight) issues.push(issue('warning', `分辨率低于 ${rules.minWidth}×${rules.minHeight}`));
    if (/\s/.test(image.name)) issues.push(issue('suggestion', '文件名包含空格'));
    if (/[^\w\-.\u4e00-\u9fff]/u.test(image.name)) issues.push(issue('suggestion', '文件名包含特殊符号'));
    if (/\p{Script=Han}/u.test(image.name)) issues.push(issue('suggestion', '文件名包含中文'));
    if (effectiveSettings.output.format === 'jpeg' && image.hasAlpha) issues.push(issue('warning', '输出 JPG 将失去透明度'));
    const hash = fileHashes[imageIndex];
    if (hashes.has(hash)) issues.push(issue('error', `内容与“${hashes.get(hash)}”完全重复`)); else hashes.set(hash, image.name);
    try {
      const visual = await averageHash(image.file);
      const similar = visualHashes.find((entry) => hamming(entry.hash, visual) <= 5);
      if (similar && !issues.some((entry) => entry.message.includes('完全重复'))) issues.push(issue('warning', `内容与“${similar.name}”高度相似`));
      visualHashes.push({ name: image.name, hash: visual });
    } catch { issues.push(issue('suggestion', '无法生成相似度指纹')); }
    results.push({ id: image.id, name: image.name, width: image.width, height: image.height, size: image.size, settingsMode: image.settingsMode || 'global', issues });
  }
  const dimensions = new Set(images.map((image) => `${image.width}×${image.height}`));
  const ratios = new Set(images.map((image) => (image.width / image.height).toFixed(3)));
  const formats = new Set(images.map((image) => image.extension));
  if (dimensions.size > 1) results.forEach((result) => result.issues.push(issue('suggestion', '批次尺寸不一致')));
  if (ratios.size > 1) results.forEach((result) => result.issues.push(issue('suggestion', '批次比例不一致')));
  if (formats.size > 1) results.forEach((result) => result.issues.push(issue('suggestion', '批次格式不一致')));
  return results;
}

export function inspectionToMarkdown(results) {
  const issueCount = results.reduce((sum, result) => sum + result.issues.length, 0);
  const customCount = results.filter((result) => result.settingsMode === 'custom').length;
  const lines = ['# 像序 · 文件检查报告', '', `- 文件数量：${results.length}`, `- 统一设置：${results.length - customCount} 张`, `- 自定义设置：${customCount} 张`, ...(customCount ? [`- 提示：${customCount} 张图片使用独立设置，导出结果可能存在尺寸或位置差异。`] : []), `- 问题数量：${issueCount}`, `- 生成时间：${new Date().toLocaleString('zh-CN')}`, '', '| 文件 | 尺寸 | 问题 |', '|---|---:|---|'];
  results.forEach((result) => lines.push(`| ${result.name.replaceAll('|', '\\|')} | ${result.width}×${result.height} | ${result.issues.map((entry) => `[${entry.level}] ${entry.message}`).join('；') || '通过'} |`));
  return lines.join('\n');
}

function issue(level, message) { return { level, message }; }
async function averageHash(file) {
  const bitmap = await decodeForInspection(file);
  const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0, 16, 16); bitmap.close?.();
  const data = context.getImageData(0, 0, 16, 16).data; const values = [];
  for (let index = 0; index < data.length; index += 4) values.push((data[index] + data[index + 1] + data[index + 2]) / 3);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value >= average ? '1' : '0').join('');
}
async function decodeForInspection(file) {
  try { return await createImageBitmap(file); }
  catch {
    const url = URL.createObjectURL(file);
    try { return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('无法解码')); image.src = url; }); }
    finally { window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  }
}
function hamming(a, b) { let distance = 0; for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) distance += 1; return distance + Math.abs(a.length - b.length); }
