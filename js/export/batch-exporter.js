import { renderImageForExport } from './exporter.js?v=11';
import { formatFilename, resolveDuplicateFilename } from './filename-template.js';
import { createZipBlob } from './zip-exporter.js';

export async function runBatchExport(images, globalSettings, callbacks) {
  let mode = globalSettings.output.mode;
  let fallbackToZip = false;
  let directory = null;
  if (mode === 'folder') {
    if (callbacks.directoryHandle) {
      directory = callbacks.directoryHandle;
    } else if ('showDirectoryPicker' in window) {
      try {
        directory = await window.showDirectoryPicker({ id: 'xiangxu-export', mode: 'readwrite', startIn: 'downloads' });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        mode = 'zip';
        fallbackToZip = true;
        callbacks.onLog(`文件夹写入不可用（${error.message}），已回退为 ZIP。`, 'warning');
      }
    } else {
      mode = 'zip';
      fallbackToZip = true;
      callbacks.onLog('当前浏览器不支持文件夹写入，已回退为 ZIP。', 'warning');
    }
  }

  const usedNames = new Set();
  if (directory) {
    try {
      for await (const [name] of directory.entries()) usedNames.add(name.toLocaleLowerCase());
    } catch {
      callbacks.onLog('无法读取目标文件夹现有文件名，将使用批次内防重名。', 'warning');
    }
  }
  const entries = [];
  const failures = [];
  let completed = 0;
  let bytes = 0;

  for (let index = 0; index < images.length; index += 1) {
    if (callbacks.controller.cancelled) break;
    await waitWhilePaused(callbacks.controller);
    if (callbacks.controller.cancelled) break;
    const image = images[index];
    try {
      const settings = callbacks.getSettings ? callbacks.getSettings(image.id) : globalSettings;
      callbacks.onLog(`正在处理：${image.name}`);
      const rendered = await renderImageForExport(image, settings);
      const rawName = formatFilename(image, settings.output, { width: rendered.width, height: rendered.height }, settings.output.sequenceStart + index, settings.presetName);
      const name = resolveDuplicateFilename(rawName, usedNames);
      if (directory) {
        const handle = await directory.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(rendered.blob);
        await writable.close();
      } else {
        entries.push({ name, blob: rendered.blob });
      }
      completed += 1;
      bytes += rendered.blob.size;
      callbacks.onLog(`完成：${name}（${rendered.width}×${rendered.height}，${rendered.blob.size} bytes${settings.compression?.targetEnabled ? `，质量 ${rendered.quality}${rendered.targetReached ? '' : '，未达到目标体积'}` : ''}）`, rendered.targetReached === false ? 'warning' : 'success');
    } catch (error) {
      failures.push({ image: image.name, error: error.message });
      callbacks.onLog(`失败：${image.name} — ${error.message}`, 'error');
    }
    callbacks.onProgress({ completed, failed: failures.length, processed: index + 1, total: images.length, bytes });
  }

  let zipBlob = null;
  if (!directory && entries.length && !callbacks.controller.cancelled) {
    callbacks.onLog(`正在生成 ZIP，共 ${entries.length} 个文件。`);
    zipBlob = await createZipBlob(entries);
    callbacks.onLog(`ZIP 生成完成（${zipBlob.size} bytes）。`, 'success');
  }
  return { mode, fallbackToZip, completed, failures, bytes, zipBlob, cancelled: callbacks.controller.cancelled };
}

async function waitWhilePaused(controller) {
  while (controller.paused && !controller.cancelled) await new Promise((resolve) => window.setTimeout(resolve, 120));
}
