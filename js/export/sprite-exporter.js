import { renderImageForExport } from './exporter.js?v=8';
import { createZipBlob } from './zip-exporter.js';

export async function createSpritePackage(images, settings, onProgress = () => {}, getSettings = null) {
  const sprite = settings.sprite;
  const ordered = [...images].sort((a, b) => sprite.sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : a.importOrder - b.importOrder);
  const layout = getSpriteLayout(ordered.length, sprite);
  const { columns, rows, width, height } = layout;
  if (width > 16384 || height > 16384) throw new Error(`Sprite 尺寸 ${width}×${height} 超过浏览器安全限制`);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (sprite.backgroundType === 'solid') { context.fillStyle = sprite.background; context.fillRect(0, 0, width, height); }
  const map = {};
  for (let index = 0; index < ordered.length; index += 1) {
    const effective = getSettings ? getSettings(ordered[index].id) : structuredClone(settings);
    const rendered = await renderImageForExport(ordered[index], { ...effective, compression: { ...effective.compression, targetEnabled: false }, output: { ...effective.output, format: 'png' } });
    const bitmap = await createImageBitmap(rendered.blob);
    const column = index % columns; const row = Math.floor(index / columns);
    const x = column * (sprite.cellWidth + sprite.gap); const y = row * (sprite.cellHeight + sprite.gap);
    const scale = Math.min(sprite.cellWidth / bitmap.width, sprite.cellHeight / bitmap.height);
    const drawWidth = bitmap.width * scale; const drawHeight = bitmap.height * scale;
    context.drawImage(bitmap, x + ((sprite.cellWidth - drawWidth) / 2), y + ((sprite.cellHeight - drawHeight) / 2), drawWidth, drawHeight); bitmap.close();
    const key = uniqueKey(ordered[index].name.replace(/\.[^.]+$/, ''), map);
    map[key] = { x, y, width: sprite.cellWidth, height: sprite.cellHeight };
    onProgress(index + 1, ordered.length);
  }
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  canvas.width = 1; canvas.height = 1;
  const json = JSON.stringify(map, null, 2);
  const base = safeBaseName(sprite.filename);
  const css = Object.entries(map).map(([key, value]) => `.sprite-${cssName(key)}{background-image:url('./${base}.png');background-position:-${value.x}px -${value.y}px;width:${value.width}px;height:${value.height}px}`).join('\n');
  const markdown = ['# Sprite Sheet 素材清单', '', `画布：${width}×${height} · ${columns} 列 × ${rows} 行`, '', `![Sprite](./${base}.png)`, '', '| 名称 | X | Y | 宽 | 高 |', '|---|---:|---:|---:|---:|', ...Object.entries(map).map(([key, value]) => `| ${key} | ${value.x} | ${value.y} | ${value.width} | ${value.height} |`)].join('\n');
  const blob = await createZipBlob([{ name: `${base}.png`, blob: png }, { name: `${base}.json`, blob: new Blob([json], { type: 'application/json' }) }, { name: `${base}.css`, blob: new Blob([css], { type: 'text/css' }) }, { name: 'README.md', blob: new Blob([markdown], { type: 'text/markdown' }) }]);
  return { blob, base, ...layout };
}

export function getSpriteLayout(count, sprite) {
  const safeCount = Math.max(0, count);
  const columns = safeCount ? Math.max(1, Math.min(safeCount, sprite.autoColumns ? Math.ceil(Math.sqrt(safeCount)) : Number(sprite.columns) || 1)) : 0;
  const rows = columns ? Math.ceil(safeCount / columns) : 0;
  let width = columns ? (columns * sprite.cellWidth) + (Math.max(0, columns - 1) * sprite.gap) : 0;
  let height = rows ? (rows * sprite.cellHeight) + (Math.max(0, rows - 1) * sprite.gap) : 0;
  if (sprite.powerOfTwo && width && height) { width = nextPowerOfTwo(width); height = nextPowerOfTwo(height); }
  return { columns, rows, width, height };
}

function uniqueKey(name, map) { let key = name; let suffix = 2; while (key in map) key = `${name}-${suffix++}`; return key; }
function cssName(value) { return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item'; }
function safeBaseName(value) { return String(value || 'sprite').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\.+$/, '').trim() || 'sprite'; }
function nextPowerOfTwo(value) { let result = 1; while (result < value) result *= 2; return result; }
