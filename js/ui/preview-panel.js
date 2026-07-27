import { formatBytes } from '../utils/format.js';
import { renderCanvasPipeline } from '../render/canvas-pipeline.js?v=5';
import { removeBackgroundWithAi } from '../ai/background-remover.js?v=5';
import { getEffectiveSettings } from '../state/selectors.js';

export function createPreviewRenderer(elements) {
  let renderToken = 0;
  let scheduledRender = 0;
  async function render(state) {
    window.clearTimeout(scheduledRender);
    const token = ++renderToken;
    const imageRecord = state.images.find((image) => image.id === state.activeImageId);
    if (!imageRecord) {
      elements.empty.classList.remove('is-hidden');
      elements.figure.classList.add('is-hidden');
      elements.info.innerHTML = '<span>未选择图片</span><span>—</span><span>—</span>';
      elements.onRendered?.();
      return;
    }
    const settings = getEffectiveSettings(state, imageRecord.id);
    try {
      const bitmap = await decodePreviewSource(imageRecord);
      if (token !== renderToken) { bitmap.close?.(); return; }
      let aiCanvas = null;
      if (settings.ai?.enabled && state.previewMode !== 'original') {
        aiCanvas = await removeBackgroundWithAi(bitmap, settings.ai, (value, stage) => elements.onAiProgress?.(value, stage), imageRecord.id, imageRecord.aiMaskEdits);
        if (token !== renderToken) { bitmap.close?.(); aiCanvas.width = 1; aiCanvas.height = 1; return; }
      }
      const pipelineSource = aiCanvas || bitmap;
      let outputWidth = bitmap.width;
      let outputHeight = bitmap.height;
      let pipelineResult = null;
      if (state.previewMode === 'compare') {
        const processedCanvas = document.createElement('canvas');
        pipelineResult = renderCanvasPipeline(processedCanvas, pipelineSource, settings, { maxDimension: 1024 });
        ({ outputWidth, outputHeight } = pipelineResult);
        const sideWidth = processedCanvas.width; const sideHeight = processedCanvas.height;
        elements.canvas.width = sideWidth * 2; elements.canvas.height = sideHeight;
        const context = elements.canvas.getContext('2d');
        const originalScale = Math.min(sideWidth / bitmap.width, sideHeight / bitmap.height);
        const originalWidth = bitmap.width * originalScale; const originalHeight = bitmap.height * originalScale;
        context.drawImage(bitmap, (sideWidth - originalWidth) / 2, (sideHeight - originalHeight) / 2, originalWidth, originalHeight);
        context.drawImage(processedCanvas, sideWidth, 0);
        context.fillStyle = 'rgba(15,23,42,.72)'; context.fillRect(sideWidth - 1, 0, 2, sideHeight);
        context.font = '600 12px "Microsoft YaHei UI",sans-serif'; context.textBaseline = 'top';
        context.fillStyle = 'rgba(15,23,42,.72)'; context.fillRect(8, 8, 42, 24); context.fillRect(sideWidth + 8, 8, 54, 24);
        context.fillStyle = '#fff'; context.fillText('原图', 17, 14); context.fillText('处理后', sideWidth + 17, 14);
        processedCanvas.width = 1; processedCanvas.height = 1;
      } else if (state.previewMode === 'processed') {
        pipelineResult = renderCanvasPipeline(elements.canvas, pipelineSource, settings);
        ({ outputWidth, outputHeight } = pipelineResult);
      } else {
        const maxDimension = 2048;
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        elements.canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        elements.canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = elements.canvas.getContext('2d');
        context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, elements.canvas.width, elements.canvas.height);
      }
      bitmap.close?.();
      if (aiCanvas) { aiCanvas.width = 1; aiCanvas.height = 1; }
      elements.canvas.dataset.renderMode = state.previewMode;
      elements.canvas.dataset.outputWidth = String(outputWidth);
      elements.canvas.dataset.outputHeight = String(outputHeight);
      if (pipelineResult) {
        elements.canvas.dataset.drawRect = [pipelineResult.drawRect.x, pipelineResult.drawRect.y, pipelineResult.drawRect.width, pipelineResult.drawRect.height].map((value) => Math.round(value * 100) / 100).join(',');
        const background = settings.canvas.enabled ? settings.canvas.background : { type: 'transparent', color: '#ffffff' };
        elements.canvas.dataset.background = background.type === 'solid' ? background.color : 'transparent';
        elements.canvas.dataset.sourceRect = [pipelineResult.sourceRect.x, pipelineResult.sourceRect.y, pipelineResult.sourceRect.width, pipelineResult.sourceRect.height].map((value) => Math.round(value * 100) / 100).join(',');
        elements.canvas.dataset.mask = [pipelineResult.mask.type, pipelineResult.mask.x, pipelineResult.mask.y, pipelineResult.mask.width, pipelineResult.mask.height, pipelineResult.mask.radius].map((value) => typeof value === 'number' ? Math.round(value * 100) / 100 : value).join(',');
        elements.canvas.dataset.alphaProbe = pipelineResult.alphaProbe.join(',');
        elements.canvas.dataset.rgbaProbe = pipelineResult.rgbaProbe.map((rgba) => rgba.join(':')).join(',');
      } else {
        delete elements.canvas.dataset.drawRect;
        delete elements.canvas.dataset.background;
        delete elements.canvas.dataset.sourceRect;
        delete elements.canvas.dataset.mask;
        delete elements.canvas.dataset.alphaProbe;
        delete elements.canvas.dataset.rgbaProbe;
      }
      const availableWidth = Math.max(1, elements.figure.clientWidth - 64);
      const availableHeight = Math.max(1, elements.figure.clientHeight - 64);
      const fitScale = Math.min(1, availableWidth / elements.canvas.width, availableHeight / elements.canvas.height);
      elements.canvas.style.width = `${Math.round(elements.canvas.width * fitScale)}px`;
      elements.canvas.style.height = `${Math.round(elements.canvas.height * fitScale)}px`;
      elements.wrap.style.width = elements.canvas.style.width;
      elements.wrap.style.height = elements.canvas.style.height;
      elements.wrap.style.transform = `scale(${state.zoom})`;
      elements.guides.classList.toggle('is-hidden', !(state.previewMode === 'processed' && settings.crop.enabled && settings.crop.guides !== 'none'));
      elements.guides.dataset.guideType = settings.crop.guides;
      elements.wrap.classList.toggle('is-cropping', state.previewMode === 'processed' && settings.crop.enabled);
      elements.empty.classList.add('is-hidden');
      elements.figure.classList.remove('is-hidden');
      const modeLabel = state.previewMode === 'processed' ? `处理后 · ${outputWidth} × ${outputHeight} px` : state.previewMode === 'compare' ? `对比 · 输出 ${outputWidth} × ${outputHeight} px` : `原图 · ${imageRecord.width} × ${imageRecord.height} px`;
      elements.info.innerHTML = `<span>${escapeHtml(imageRecord.name)}</span><span>${modeLabel}</span><span>${formatBytes(imageRecord.size)}</span>`;
      elements.onRendered?.();
    } catch (error) {
      if (settings.ai?.enabled) elements.onAiProgress?.(100, 'AI 处理已结束');
      elements.onError(`预览失败：${error.message}`);
    }
  }
  function schedule(state, delay = 140) {
    window.clearTimeout(scheduledRender);
    scheduledRender = window.setTimeout(() => render(state), delay);
  }
  return { render, schedule };
}

async function decodePreviewSource(imageRecord) {
  try { return await createImageBitmap(imageRecord.file); }
  catch {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('浏览器无法解码此图片用于预览'));
      image.src = imageRecord.objectUrl;
    });
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
