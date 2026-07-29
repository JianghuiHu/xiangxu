import { createStore } from './state/store.js?v=9';
import { createActions } from './state/actions.js?v=12';
import { importFiles, filesFromDataTransfer } from './import/file-importer.js?v=3';
import { filesFromClipboard } from './import/clipboard-importer.js';
import { renderImageList, getVisibleImages } from './ui/image-list.js?v=3';
import { createPreviewRenderer } from './ui/preview-panel.js?v=12';
import { createToast } from './ui/toast.js';
import { bindSettingsPanel } from './ui/settings-panel.js';
import { runBatchExport } from './export/batch-exporter.js?v=7';
import { downloadBlob, getRuntimeHost } from './export/exporter.js?v=13';
import { formatFilename } from './export/filename-template.js';
import { getOutputSize } from './render/canvas-pipeline.js?v=7';
import { createCurveSvgPath } from './render/color-engine.js?v=4';
import { formatBytes } from './utils/format.js';
import { SYSTEM_PRESETS } from './presets/system-presets.js';
import { listUserPresets, saveUserPreset, deleteUserPreset, updateUserPreset, serializePreset, parsePresetJson } from './presets/preset-manager.js?v=4';
import { inspectImages, inspectionToMarkdown } from './inspection/image-inspector.js?v=3';
import { createSpritePackage, getSpriteLayout } from './export/sprite-exporter.js?v=4';
import { preloadWatermarkImage } from './render/watermark-engine.js';
import { loadExportDirectoryHandle, saveExportDirectoryHandle, ensureDirectoryPermission } from './export/directory-handle-store.js';
import { AI_MODEL_CATALOG, listInstalledModels, downloadAndInstallModel, deleteModel } from './ai/model-manager.js?v=6';
import { loadExternalModelCatalog, renderExternalModelCards } from './ai/external-models.js?v=2';
import { clearAiMaskCache } from './ai/background-remover.js?v=8';
import { mapCanvasPointToSource, toUnscaledLocalPoint } from './ai/brush-geometry.js?v=1';
import { getEffectiveSettings, getImageById, getCustomImageCount, getSettingsScope } from './state/selectors.js';

const $ = (selector) => document.querySelector(selector);
const store = createStore();
const actions = createActions(store);
const toast = createToast($('#toast-region'));
const emptyListTemplate = $('#empty-list').cloneNode(true);
const preview = createPreviewRenderer({
  canvas: $('#preview-canvas'), wrap: $('#canvas-wrap'), guides: $('#crop-guides'), figure: $('#preview-figure'), empty: $('#preview-empty'), info: $('#preview-info'),
  onError: (message) => toast(message, 'error', 7000),
  onAiProgress: (value, stage) => updateAiProgress(value, stage, true),
  onRendered: clearAiBrushOverlay
});
let importing = false;
let exportController = null;
let userPresets = [];
const SYSTEM_META_KEY = 'imageBatchStudio.systemPresetMeta.v1';
let systemPresetMeta = (() => { try { return JSON.parse(localStorage.getItem(SYSTEM_META_KEY) || '{}'); } catch { return {}; } })();
let inspectionResults = [];
let exportDirectoryHandle = null;
let installedAiModels = new Map();
let aiOperationRunning = false;
let aiDownloadController = null;
let aiProgressHideTimer = 0;
let pendingDownloadUrl = null;
let aiBrushMode = 'off';
let aiBrushPainting = false;
let aiBrushDraft = null;
let externalModelCatalog = null;
let pendingExternalLink = null;
let activeCurveChannel = 'rgb';
let colorPickerState = null;

document.documentElement.dataset.runtimeHost = getRuntimeHost();
window.addEventListener('xiangxu:download-ready', (event) => {
  if (pendingDownloadUrl) URL.revokeObjectURL(pendingDownloadUrl);
  pendingDownloadUrl = event.detail.url;
  const link = $('#download-result-link');
  link.href = event.detail.url;
  link.download = event.detail.filename;
  link.textContent = `保存 ${event.detail.filename}（${formatBytes(event.detail.size)}）`;
  link.classList.remove('is-hidden');
  toast('文件已安全生成，请点击绿色按钮保存到本地', 'success', 7000);
});

function clearPendingDownload() {
  if (pendingDownloadUrl) URL.revokeObjectURL(pendingDownloadUrl);
  pendingDownloadUrl = null;
  const link = $('#download-result-link');
  link.removeAttribute('href');
  link.classList.add('is-hidden');
}

function updateAiProgress(value, stage = '处理中', showPreviewOverlay = false) {
  window.clearTimeout(aiProgressHideTimer);
  const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const failed = String(stage).includes('失败');
  $('#ai-progress-panel').classList.remove('is-hidden');
  $('#ai-progress-panel').classList.toggle('is-error', failed);
  $('#ai-progress').value = progress;
  $('#ai-progress-label').textContent = stage;
  $('#ai-progress-percent').textContent = `${progress}%`;
  $('#ai-progress-hint').textContent = failed
    ? '模型未应用到预览，请根据上方错误提示处理后重试'
    : progress < 100 ? '请稍候，模型和图片始终只在本机处理' : '已完成；后续调整会优先复用 Mask 缓存';
  if (showPreviewOverlay) {
    $('#ai-preview-loading').classList.remove('is-hidden');
    $('#ai-preview-loading-label').textContent = stage;
    $('#ai-preview-loading-progress').value = progress;
  }
  if (failed) {
    $('#ai-preview-loading').classList.add('is-hidden');
    aiProgressHideTimer = window.setTimeout(() => $('#ai-progress-panel').classList.add('is-hidden'), 6500);
  } else if (progress >= 100) {
    aiProgressHideTimer = window.setTimeout(() => {
      $('#ai-progress-panel').classList.add('is-hidden');
      $('#ai-preview-loading').classList.add('is-hidden');
    }, 850);
  }
}

function allPresets() {
  return [...SYSTEM_PRESETS.map((preset) => ({ ...preset, ...(systemPresetMeta[preset.id] || {}) })), ...userPresets];
}

async function refreshPresets() {
  userPresets = await listUserPresets();
  $('#user-preset-count').textContent = `${userPresets.length} 个`;
  renderPresetLibrary();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function confirmAction(message, { title = '确认操作', confirmText = '确认' } = {}) {
  return new Promise((resolve) => {
    const dialog = $('#confirm-dialog');
    $('#confirm-dialog-title').textContent = title;
    $('#confirm-dialog-confirm').textContent = confirmText;
    $('#confirm-dialog-message').textContent = message;
    const onClose = () => { dialog.removeEventListener('close', onClose); resolve(dialog.returnValue === 'confirm'); };
    dialog.addEventListener('close', onClose); dialog.showModal();
  });
}

async function openExternalModelLibrary(focusModelId = '') {
  const dialog = $('#external-model-dialog');
  dialog.showModal();
  const container = $('#external-model-list');
  if (externalModelCatalog) {
    container.innerHTML = renderExternalModelCards(externalModelCatalog.models);
    focusExternalModelCard(focusModelId);
    return;
  }
  container.innerHTML = '<div class="external-model-loading">正在读取模型目录…</div>';
  try {
    await ensureExternalModelCatalog();
    container.innerHTML = renderExternalModelCards(externalModelCatalog.models);
    focusExternalModelCard(focusModelId);
  } catch (error) {
    container.innerHTML = `<div class="preset-empty">模型目录读取失败：${escapeHtml(error.message)}<br>这不会影响像序内置抠图和基础图片处理。</div>`;
  }
}

function focusExternalModelCard(modelId) {
  if (!modelId) return;
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-external-model-id="${CSS.escape(modelId)}"]`);
    card?.classList.add('is-selected');
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function syncExternalModelOptions() {
  const group = $('#external-model-options');
  if (!group || !externalModelCatalog) return;
  group.replaceChildren(...externalModelCatalog.models
    .filter((model) => model.id !== 'ppmattingv2-external')
    .map((model) => {
      const option = document.createElement('option');
      option.value = `external:${model.id}`;
      option.textContent = `${model.name} · ${model.compatibility.label}`;
      return option;
    }));
}

async function ensureExternalModelCatalog() {
  if (!externalModelCatalog) {
    externalModelCatalog = await loadExternalModelCatalog();
    syncExternalModelOptions();
  }
  return externalModelCatalog;
}

function getSelectedExternalModel(modelId) {
  if (!modelId?.startsWith('external:') || !externalModelCatalog) return null;
  return externalModelCatalog.models.find((model) => model.id === modelId.slice('external:'.length)) || null;
}

function requestExternalUrl({ url: rawUrl, label = '外部链接', source = '' }) {
  const url = new URL(rawUrl, window.location.href);
  if (url.protocol !== 'https:') {
    toast('已阻止非 HTTPS 外部链接', 'warning');
    return;
  }
  pendingExternalLink = {
    url: url.href,
    label,
    source: source || url.hostname
  };
  $('#external-link-label').textContent = pendingExternalLink.label;
  $('#external-link-host').textContent = url.hostname;
  $('#external-link-source').textContent = pendingExternalLink.source;
  $('#external-link-dialog').showModal();
}

function requestExternalLink(link) {
  requestExternalUrl({
    url: link.dataset.externalUrl,
    label: link.dataset.externalLabel,
    source: link.dataset.externalSource
  });
}

function cancelExternalLink() {
  pendingExternalLink = null;
  $('#external-link-dialog').close('cancel');
}

function openPendingExternalLink() {
  if (!pendingExternalLink) return;
  const target = pendingExternalLink;
  pendingExternalLink = null;
  window.open(target.url, '_blank', 'noopener,noreferrer');
  $('#external-link-dialog').close('opened');
  toast(`已在新窗口打开：${target.label}`);
}

function renderPresetLibrary() {
  const container = $('#preset-list');
  if (!container) return;
  const query = $('#preset-search').value.trim().toLowerCase();
  const filter = $('#preset-filter').value;
  const presets = allPresets().filter((preset) => {
    if (query && !`${preset.name} ${preset.description || ''}`.toLowerCase().includes(query)) return false;
    if (filter === 'favorite') return preset.favorite;
    if (filter === 'recent') return preset.lastUsedAt > 0;
    if (filter === 'user') return !preset.system;
    return true;
  }).sort((a, b) => filter === 'recent' ? (b.lastUsedAt || 0) - (a.lastUsedAt || 0) : Number(b.favorite) - Number(a.favorite) || Number(a.system) - Number(b.system) || (b.lastUsedAt || b.updatedAt) - (a.lastUsedAt || a.updatedAt));
  container.innerHTML = presets.length ? presets.map((preset) => `<article class="preset-item" data-preset-id="${escapeHtml(preset.id)}"><button class="preset-favorite ${preset.favorite ? 'active' : ''}" data-preset-action="favorite" type="button" aria-label="${preset.favorite ? '取消收藏' : '收藏'}">★</button><div class="preset-copy"><strong>${escapeHtml(preset.name)}<span class="preset-kind ${preset.system ? '' : 'user'}">${preset.system ? '系统' : '用户'}</span></strong><p>${escapeHtml(preset.description || '无说明')}</p></div><div class="preset-item-actions"><button class="button button-primary" data-preset-action="apply" type="button">应用</button>${preset.system ? '' : '<button class="button button-secondary" data-preset-action="export" type="button">导出</button><button class="button button-secondary" data-preset-action="delete" type="button">删除</button>'}</div></article>`).join('') : '<div class="preset-empty">没有符合条件的预设</div>';
}

async function applySelectedPreset(preset) {
  const usedAt = Date.now();
  if (preset.system) {
    systemPresetMeta[preset.id] = { ...(systemPresetMeta[preset.id] || {}), lastUsedAt: usedAt };
    localStorage.setItem(SYSTEM_META_KEY, JSON.stringify(systemPresetMeta));
  } else {
    await updateUserPreset(preset.id, { lastUsedAt: usedAt });
  }
  if (preset.settings.watermark?.type === 'image' && preset.settings.watermark.imageDataUrl) await preloadWatermarkImage(preset.settings.watermark.imageDataUrl);
  actions.applyPreset(preset);
  const customCount = getCustomImageCount(store.getState());
  await refreshPresets();
  $('#preset-library-dialog').close();
  toast(customCount ? `预设已应用到统一图片；${customCount} 张自定义图片保留原有设置` : `已应用预设：${preset.name}`, 'success', 5000);
}

async function exportPreset(preset) {
  const safeName = preset.name.replace(/[\\/:*?"<>|]/g, '_');
  const result = await downloadBlob(new Blob([serializePreset(preset)], { type: 'application/json;charset=utf-8' }), `${safeName}.json`);
  if (result.cancelled) toast('已取消保存预设', 'warning');
  else if (result.mode === 'desktop') toast(`预设已保存：${result.path || preset.name}`);
}

async function handleFiles(files, source = '选择') {
  if (importing || !files?.length) return;
  importing = true;
  const button = $('#add-images-button');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '正在读取…';
  try {
    const state = store.getState();
    const { images, errors } = await importFiles(files, state.importOrder);
    if (images.length) {
      store.update((current) => { current.importOrder += images.length; }, 'import:order');
      actions.addImages(images);
      const warnings = images.filter((image) => image.warning).length;
      if (warnings) store.update((current) => { current.processing.warning += warnings; }, 'import:warning');
      toast(`${source}导入 ${images.length} 张图片`);
    }
    errors.slice(0, 3).forEach((message) => toast(message, 'error', 5000));
    if (errors.length > 3) toast(`另有 ${errors.length - 3} 个文件导入失败`, 'error');
  } finally {
    importing = false;
    button.disabled = false;
    button.textContent = originalText;
    $('#file-input').value = '';
    $('#folder-input').value = '';
  }
}

function render(state, action) {
  renderImageList($('#image-list'), emptyListTemplate, state, {
    onActivate: actions.setActive,
    onToggle: actions.toggleSelected,
    onRemove: (id) => actions.removeImages([id])
  });
  const visible = getVisibleImages(state);
  const activeImage = getImageById(state, state.activeImageId);
  const effectiveSettings = getEffectiveSettings(state, state.activeImageId);
  const panelSettings = structuredClone(effectiveSettings);
  panelSettings.output.mode = state.settings.output.mode;
  panelSettings.sprite = state.settings.sprite;
  panelSettings.inspection = state.settings.inspection;
  const settingsScope = getSettingsScope(state, state.activeImageId);
  $('#image-count').textContent = state.images.length;
  $('#output-count').textContent = `${state.images.length} 张`;
  $('#status-total').textContent = state.images.length;
  $('#status-pending').textContent = state.processing.pending;
  $('#status-completed').textContent = state.processing.completed;
  $('#status-failed').textContent = state.processing.failed;
  $('#status-warning').textContent = state.processing.warning;
  $('#task-progress').value = state.processing.progress;
  $('#pause-button').disabled = !state.processing.running;
  $('#cancel-button').disabled = !state.processing.running;
  $('#pause-button').textContent = state.processing.paused ? '继续' : '暂停';
  $('#memory-status').textContent = state.processing.running ? (state.processing.paused ? '任务已暂停' : `处理中 ${state.processing.progress}%`) : '本地会话';
  $('#start-processing-button').disabled = state.images.length === 0 || state.processing.running;
  $('#start-processing-button').textContent = state.processing.running ? '正在处理…' : '开始处理并导出';
  $('#output-size').textContent = state.processing.bytes ? formatBytes(state.processing.bytes) : '待处理';
  $('#new-task-button').disabled = !state.taskDirty || state.processing.running;
  $('#export-sprite-button').disabled = state.images.length === 0 || state.processing.running;
  $('#run-inspection-button').disabled = state.images.length === 0 || state.processing.running;
  const history = store.historyState();
  $('#undo-button').disabled = !history.canUndo;
  $('#redo-button').disabled = !history.canRedo;
  $('#current-preset-name').textContent = `${state.preset.name}${state.preset.modified ? ' · 已修改' : ''}`;
  updateExportLocationUi(state.settings.output.mode);
  updateAiModelUi(state);
  $('#log-content').textContent = state.processing.logs.length ? state.processing.logs.map((entry) => `[${entry.time}] ${entry.level.toUpperCase()}  ${entry.message}`).join('\n') : '暂无任务记录';
  $('#delete-selected-button').disabled = state.selectedIds.size === 0;
  $('#clear-button').disabled = state.images.length === 0;
  $('#select-all-checkbox').checked = visible.length > 0 && visible.every((image) => state.selectedIds.has(image.id));
  $('#select-all-checkbox').indeterminate = visible.some((image) => state.selectedIds.has(image.id)) && !visible.every((image) => state.selectedIds.has(image.id));
  setValue('#settings-mode-filter', state.settingsFilter);
  document.querySelectorAll('[data-settings-mode]').forEach((button) => {
    button.disabled = !activeImage || state.processing.running;
    const selected = button.dataset.settingsMode === settingsScope;
    button.setAttribute('aria-checked', String(selected));
    button.classList.toggle('active', selected);
  });
  $('#image-settings-control').classList.toggle('is-custom', settingsScope === 'custom');
  $('#image-settings-control').title = settingsScope === 'custom' ? '该图片拥有独立参数，修改不会影响其他图片' : '该图片使用当前任务的统一处理参数';
  $('#settings-scope-banner').classList.toggle('is-custom', settingsScope === 'custom');
  $('#settings-scope-title').textContent = settingsScope === 'custom' ? '正在编辑：当前图片的自定义参数' : '正在编辑：统一参数';
  $('#settings-scope-description').textContent = settingsScope === 'custom' ? '图片处理参数仅影响当前图；导出位置、Sprite 布局和检查规则仍为任务级设置' : '将应用于所有使用统一设置的图片';
  document.querySelectorAll('.swatch').forEach((swatch) => swatch.classList.toggle('active', swatch.dataset.background === state.previewBackground));
  document.querySelectorAll('[data-preview-mode]').forEach((button) => button.classList.toggle('active', button.dataset.previewMode === state.previewMode));
  syncSettingsControls(panelSettings);
  syncAiBrushControls(state, activeImage, effectiveSettings);
  syncColorPickerUi();
  const stage = $('#preview-stage');
  stage.classList.toggle('checkerboard', state.previewBackground === 'checker');
  stage.style.backgroundColor = state.previewBackground === 'white' ? '#fff' : state.previewBackground === 'black' ? '#111827' : '';
  if (!['selection:toggle', 'selection:all', 'filter:query', 'filter:sort', 'filter:settings-mode', 'preview:background'].includes(action) && !action.startsWith('processing:')) {
    if (effectiveSettings.ai.enabled && action?.startsWith('settings:')) preview.schedule(state);
    else preview.render(state);
  }
  else if (action === 'preview:background') preview.render(state);
  $('#fit-button').textContent = state.zoom === 1 ? '适应窗口' : `${Math.round(state.zoom * 100)}%`;
}

function signedValue(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function syncCurveControls(colorSettings) {
  const curve = colorSettings.curves?.[activeCurveChannel] || { shadows: 0, midtones: 0, highlights: 0 };
  document.querySelectorAll('[data-curve-channel]').forEach((button) => {
    const selected = button.dataset.curveChannel === activeCurveChannel;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  ['shadows', 'midtones', 'highlights'].forEach((tone) => {
    setValue(`#curve-${tone}`, curve[tone] || 0);
    $(`#curve-${tone}-output`).textContent = signedValue(curve[tone]);
  });
  const preview = $('.color-curve-preview');
  preview.dataset.channel = activeCurveChannel;
  $('#color-curve-line').setAttribute('points', createCurveSvgPath(curve));
}

function syncColorPickerUi() {
  const activePath = colorPickerState?.path || '';
  document.querySelectorAll('[data-color-picker-path]').forEach((button) => {
    const active = button.dataset.colorPickerPath === activePath;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#color-picker-hint').classList.toggle('is-hidden', !colorPickerState);
  if (colorPickerState) $('#color-picker-hint').textContent = `正在吸取${colorPickerState.label}：点击中间原图，按 Esc 取消。`;
  $('#canvas-wrap').classList.toggle('is-color-picking', Boolean(colorPickerState));
}

function syncSettingsControls(settings) {
  setChecked('#ai-enabled', settings.ai.enabled);
  setValue('#ai-model-select', settings.ai.modelId);
  setValue('#ai-threshold', settings.ai.threshold);
  setValue('#ai-softness', settings.ai.softness);
  setValue('#ai-feather', settings.ai.feather);
  setValue('#ai-edge-shift', settings.ai.edgeShift);
  setValue('#ai-brush-size', settings.ai.brushSize);
  $('#ai-threshold-output').textContent = Number(settings.ai.threshold).toFixed(2);
  $('#ai-softness-output').textContent = Number(settings.ai.softness).toFixed(2);
  $('#ai-feather-output').textContent = `${Number(settings.ai.feather) || 0} px`;
  const shift = Number(settings.ai.edgeShift) || 0;
  $('#ai-edge-shift-output').textContent = `${shift > 0 ? '+' : ''}${shift} px`;
  $('#ai-brush-size-output').textContent = `${Number(settings.ai.brushSize) || 36} px`;
  setChecked('#trim-enabled', settings.trim.enabled);
  setValue('#trim-mode', settings.trim.mode);
  setValue('#trim-tolerance', settings.trim.tolerance);
  setValue('#trim-padding', settings.trim.padding);
  setValue('#trim-color', settings.trim.color);
  setValue('#trim-color-text', settings.trim.color.toUpperCase());
  $('#trim-tolerance-output').textContent = String(settings.trim.tolerance);
  setChecked('#resize-enabled', settings.resize.enabled);
  setValue('#resize-width', settings.resize.width);
  setValue('#resize-height', settings.resize.height);
  setValue('#resize-mode', settings.resize.mode);
  setValue('#resize-quality', settings.resize.quality);
  setChecked('#crop-enabled', settings.crop.enabled);
  setValue('#crop-mode', settings.crop.mode);
  setValue('#crop-free-width', settings.crop.freeWidth);
  setValue('#crop-free-height', settings.crop.freeHeight);
  setValue('#crop-ratio-width', settings.crop.customRatioWidth);
  setValue('#crop-ratio-height', settings.crop.customRatioHeight);
  setValue('#crop-zoom', settings.crop.zoom);
  setValue('#crop-guides-select', settings.crop.guides);
  $('#crop-zoom-output').textContent = `${Math.round(settings.crop.zoom * 100)}%`;
  setChecked('#mask-enabled', settings.mask.enabled);
  setValue('#mask-type', settings.mask.type);
  setValue('#mask-radius', settings.mask.radius);
  setChecked('#canvas-enabled', settings.canvas.enabled);
  setValue('#canvas-width', settings.canvas.width);
  setValue('#canvas-height', settings.canvas.height);
  setValue('#background-type', settings.canvas.background.type);
  setValue('#background-color', settings.canvas.background.color);
  setValue('#background-color-text', settings.canvas.background.color.toUpperCase());
  setValue('#margin-all', settings.position.margin);
  setValue('#offset-x', settings.position.offsetX);
  setValue('#offset-y', settings.position.offsetY);
  setValue('#output-format', settings.output.format);
  setValue('#output-quality', settings.output.quality);
  setValue('#export-mode', settings.output.mode);
  setValue('#jpeg-background', settings.output.jpegBackground);
  setValue('#jpeg-background-text', settings.output.jpegBackground.toUpperCase());
  setValue('#filename-template', settings.output.filenameTemplate);
  setValue('#sequence-start', settings.output.sequenceStart);
  setValue('#sequence-digits', settings.output.sequenceDigits);
  setChecked('#subject-enabled', settings.subject.enabled);
  setValue('#subject-width', settings.subject.widthPercent);
  setValue('#subject-height', settings.subject.heightPercent);
  setChecked('#color-enabled', settings.color.enabled);
  document.querySelectorAll('[data-color-mode]').forEach((button) => {
    const selected = button.dataset.colorMode === settings.color.mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  setValue('#color-source', settings.color.source);
  setValue('#color-source-text', settings.color.source.toUpperCase());
  setValue('#color-target', settings.color.target);
  setValue('#color-target-text', settings.color.target.toUpperCase());
  setValue('#color-tolerance', settings.color.tolerance);
  setValue('#color-exposure', settings.color.exposure);
  setValue('#color-brightness', settings.color.brightness);
  setValue('#color-contrast', settings.color.contrast);
  setValue('#color-saturation', settings.color.saturation);
  setValue('#color-temperature', settings.color.temperature);
  setValue('#color-tint', settings.color.tint);
  setValue('#color-hue', settings.color.hue);
  setValue('#color-opacity', settings.color.opacity);
  $('#color-tolerance-output').textContent = String(settings.color.tolerance);
  $('#color-exposure-output').textContent = `${Number(settings.color.exposure).toFixed(1)} EV`;
  $('#color-brightness-output').textContent = `${settings.color.brightness}%`;
  $('#color-contrast-output').textContent = `${settings.color.contrast}%`;
  $('#color-saturation-output').textContent = `${settings.color.saturation}%`;
  $('#color-temperature-output').textContent = signedValue(settings.color.temperature);
  $('#color-tint-output').textContent = signedValue(settings.color.tint);
  $('#color-hue-output').textContent = `${signedValue(settings.color.hue)}°`;
  $('#color-opacity-output').textContent = `${settings.color.opacity}%`;
  syncCurveControls(settings.color);
  setChecked('#watermark-enabled', settings.watermark.enabled);
  setValue('#watermark-type', settings.watermark.type);
  setValue('#watermark-text', settings.watermark.text);
  setValue('#watermark-size', settings.watermark.fontSize);
  setValue('#watermark-opacity', settings.watermark.opacity);
  setValue('#watermark-alignment', settings.watermark.alignment);
  setChecked('#watermark-tiled', settings.watermark.tiled);
  setValue('#watermark-image-scale', settings.watermark.imageScale);
  $('#watermark-image-status').textContent = settings.watermark.imageName || (settings.watermark.imageDataUrl ? '已载入预设中的 Logo' : '尚未选择 Logo');
  $('#clear-watermark-image').disabled = !settings.watermark.imageDataUrl;
  setChecked('#target-size-enabled', settings.compression.targetEnabled);
  setValue('#target-size-kb', settings.compression.targetKB);
  setValue('#target-min-quality', settings.compression.minQuality);
  setChecked('#target-allow-resize', settings.compression.allowResize);
  setValue('#sprite-cell-width', settings.sprite.cellWidth);
  setValue('#sprite-cell-height', settings.sprite.cellHeight);
  setValue('#sprite-columns', settings.sprite.columns);
  setValue('#sprite-gap', settings.sprite.gap);
  setChecked('#sprite-auto-columns', settings.sprite.autoColumns);
  setChecked('#sprite-power-of-two', settings.sprite.powerOfTwo);
  setValue('#sprite-sort', settings.sprite.sort);
  setValue('#sprite-background-type', settings.sprite.backgroundType);
  setValue('#sprite-background', settings.sprite.background === '#00000000' ? '#ffffff' : settings.sprite.background);
  setValue('#sprite-background-text', (settings.sprite.background === '#00000000' ? '#ffffff' : settings.sprite.background).toUpperCase());
  setValue('#sprite-filename', settings.sprite.filename);
  setValue('#inspect-max-kb', settings.inspection.maxKB);
  setValue('#inspect-min-side', Math.min(settings.inspection.minWidth, settings.inspection.minHeight));
  $('#output-quality-label').textContent = String(settings.output.quality);
  $('#output-quality-row').classList.toggle('is-hidden', settings.output.format === 'png');
  $('#jpeg-background-row').classList.toggle('is-hidden', settings.output.format !== 'jpeg');
  $('#stretch-warning').classList.toggle('is-hidden', settings.resize.mode !== 'stretch' || !settings.resize.enabled);
  $('#free-crop-size').classList.toggle('is-hidden', settings.crop.mode !== 'free');
  $('#custom-crop-ratio').classList.toggle('is-hidden', settings.crop.mode !== 'custom');
  $('#mask-radius-row').classList.toggle('is-hidden', settings.mask.type !== 'rounded');
  $('#background-color-row').classList.toggle('is-hidden', settings.canvas.background.type !== 'solid');
  const colorMatchMode = ['replace', 'colorToTransparent'].includes(settings.color.mode);
  const colorModeDescriptions = {
    none: '调整整张图片的明暗、色彩和 RGB 曲线。',
    replace: '选择来源色和目标色，仅替换容差范围内的像素。',
    colorToTransparent: '选择需要移除的颜色，仅改变匹配像素的透明度。',
    grayscale: '直接生成灰度图片，无需额外参数。',
    invert: '直接反相 RGB 颜色，无需额外参数。'
  };
  $('#color-basic-adjustments').classList.toggle('is-hidden', settings.color.mode !== 'none');
  $('#color-mode-description').textContent = colorModeDescriptions[settings.color.mode] || colorModeDescriptions.none;
  $('#color-source-row').classList.toggle('is-hidden', !colorMatchMode);
  $('#color-target-row').classList.toggle('is-hidden', settings.color.mode !== 'replace');
  $('#color-tolerance-row').classList.toggle('is-hidden', !colorMatchMode);
  $('#color-source-label').textContent = settings.color.mode === 'colorToTransparent' ? '转透明颜色' : '来源颜色';
  $('#target-size-fields').classList.toggle('is-hidden', !settings.compression.targetEnabled);
  $('#watermark-text-row').classList.toggle('is-hidden', settings.watermark.type !== 'text');
  $('#watermark-text-size-row').classList.toggle('is-hidden', settings.watermark.type !== 'text');
  $('#watermark-image-row').classList.toggle('is-hidden', settings.watermark.type !== 'image');
  $('#trim-color-row').classList.toggle('is-hidden', settings.trim.mode === 'transparent');
  $('#sprite-background-row').classList.toggle('is-hidden', settings.sprite.backgroundType !== 'solid');
  $('#sprite-columns-row').classList.toggle('is-disabled', settings.sprite.autoColumns);
  $('#sprite-columns').disabled = settings.sprite.autoColumns;
  const spriteLayout = getSpriteLayout(store.getState().images.length, settings.sprite);
  $('#sprite-summary').textContent = spriteLayout.columns ? `${spriteLayout.columns} 列 × ${spriteLayout.rows} 行 · 输出 ${spriteLayout.width}×${spriteLayout.height}px` : '导入图片后显示预计布局';
  syncPipelineStep('#pipeline-trim-status', settings.trim.enabled, settings.trim.mode === 'transparent' ? '透明边' : settings.trim.color.toUpperCase());
  const contentConstraints = [settings.resize.enabled ? `${settings.resize.width}×${settings.resize.height}px` : '', settings.subject.enabled ? `${settings.subject.widthPercent}%×${settings.subject.heightPercent}%` : ''].filter(Boolean).join(' + ');
  syncPipelineStep('#pipeline-resize-status', settings.resize.enabled || settings.subject.enabled, contentConstraints);
  syncPipelineStep('#pipeline-crop-status', settings.crop.enabled, `${settings.crop.mode} · ${Math.round(settings.crop.zoom * 100)}%`);
  syncPipelineStep('#pipeline-mask-status', settings.mask.enabled, settings.mask.type);
  syncPipelineStep('#pipeline-canvas-status', settings.canvas.enabled, `${settings.canvas.width}×${settings.canvas.height}`);
  const effects = [settings.color.enabled ? '颜色' : '', settings.watermark.enabled ? '水印' : ''].filter(Boolean).join(' + ');
  syncPipelineStep('#pipeline-effects-status', settings.color.enabled || settings.watermark.enabled, effects);
  $('#pipeline-effects-status').closest('li').dataset.sectionTarget = !settings.color.enabled && settings.watermark.enabled ? 'watermark-section' : 'color-section';
  document.querySelectorAll('[data-alignment]').forEach((button) => button.classList.toggle('active', button.dataset.alignment === settings.position.alignment));
  ['#resize-width', '#resize-height', '#resize-mode', '#resize-quality'].forEach((selector) => { $(selector).disabled = !settings.resize.enabled; });
  ['#crop-mode', '#crop-free-width', '#crop-free-height', '#crop-ratio-width', '#crop-ratio-height', '#crop-zoom', '#crop-guides-select', '#reset-crop-position'].forEach((selector) => { $(selector).disabled = !settings.crop.enabled; });
  ['#mask-type', '#mask-radius'].forEach((selector) => { $(selector).disabled = !settings.mask.enabled; });
  ['#canvas-width', '#canvas-height', '#background-type'].forEach((selector) => { $(selector).disabled = !settings.canvas.enabled; });
  ['#trim-mode', '#trim-color', '#trim-color-text', '#trim-tolerance', '#trim-padding'].forEach((selector) => { $(selector).disabled = !settings.trim.enabled; });
  ['#subject-width', '#subject-height'].forEach((selector) => { $(selector).disabled = !settings.subject.enabled; });
  ['#color-source', '#color-source-text', '#color-target', '#color-target-text', '#color-tolerance', '#color-exposure', '#color-brightness', '#color-contrast', '#color-saturation', '#color-temperature', '#color-tint', '#color-hue', '#color-opacity', '#curve-shadows', '#curve-midtones', '#curve-highlights', '#reset-color-settings'].forEach((selector) => { $(selector).disabled = !settings.color.enabled; });
  document.querySelectorAll('[data-color-mode],[data-curve-channel],[data-color-picker-path]').forEach((button) => { button.disabled = !settings.color.enabled; });
  ['#watermark-type', '#watermark-text', '#watermark-size', '#watermark-opacity', '#watermark-alignment', '#watermark-tiled', '#watermark-image-input', '#watermark-image-scale'].forEach((selector) => { $(selector).disabled = !settings.watermark.enabled; });
  ['#target-size-kb', '#target-min-quality', '#target-allow-resize'].forEach((selector) => { $(selector).disabled = !settings.compression.targetEnabled; });
  const activeImage = store.getState().images.find((image) => image.id === store.getState().activeImageId) || { name: 'image.png', width: 1024, height: 1024 };
  const dimensions = getOutputSize(activeImage, settings);
  $('#filename-preview').textContent = formatFilename(activeImage, settings.output, dimensions, settings.output.sequenceStart);
}

function syncAiBrushControls(state, image, settings) {
  const available = Boolean(image && settings.ai.enabled && state.previewMode === 'processed' && !state.processing.running);
  if (!available && aiBrushMode !== 'off') aiBrushMode = 'off';
  const strokes = image?.aiMaskEdits?.strokes?.length || 0;
  document.querySelectorAll('[data-ai-brush-mode]').forEach((button) => {
    button.disabled = !image || !settings.ai.enabled || state.processing.running;
    button.classList.toggle('active', button.dataset.aiBrushMode === aiBrushMode);
    button.setAttribute('aria-pressed', String(button.dataset.aiBrushMode === aiBrushMode));
  });
  $('#ai-brush-exit').disabled = aiBrushMode === 'off';
  $('#ai-brush-clear').disabled = !strokes || state.processing.running;
  $('#ai-brush-status').textContent = aiBrushMode === 'add'
    ? `增加区域 · 已有 ${strokes} 笔`
    : aiBrushMode === 'erase' ? `减少区域 · 已有 ${strokes} 笔` : `画笔未启用 · 已有 ${strokes} 笔`;
  $('#canvas-wrap').classList.toggle('is-ai-brushing', available && aiBrushMode !== 'off');
  $('#ai-brush-cursor').classList.toggle('erase', aiBrushMode === 'erase');
  if (aiBrushMode === 'off') $('#ai-brush-cursor').classList.add('is-hidden');
}

function setAiBrushMode(mode) {
  const state = store.getState();
  const image = getImageById(state, state.activeImageId);
  const settings = getEffectiveSettings(state);
  if (mode !== 'off' && (!image || !settings.ai.enabled)) {
    toast('请先选择图片并启用 AI 抠图', 'warning');
    return;
  }
  aiBrushMode = ['add', 'erase'].includes(mode) ? mode : 'off';
  if (aiBrushMode === 'off') {
    aiBrushPainting = false;
    aiBrushDraft = null;
    clearAiBrushOverlay();
  }
  if (aiBrushMode !== 'off' && state.previewMode !== 'processed') actions.setPreviewMode('processed');
  else syncAiBrushControls(state, image, settings);
}

function setValue(selector, value) {
  const element = $(selector);
  if (document.activeElement !== element) element.value = value;
}

function setChecked(selector, value) {
  $(selector).checked = Boolean(value);
}

function syncPipelineStep(selector, enabled, detail) {
  const status = $(selector);
  const step = status.closest('li');
  step.classList.toggle('is-on', enabled);
  step.classList.toggle('is-off', !enabled);
  status.textContent = enabled ? `已开启 · ${detail}` : '已关闭';
}

function updateExportLocationUi(mode) {
  const folderMode = mode === 'folder';
  $('#export-location').classList.toggle('is-zip', !folderMode);
  $('#choose-export-folder').classList.toggle('is-hidden', !folderMode);
  $('#export-folder-name').textContent = folderMode
    ? (exportDirectoryHandle?.name || '未选择 · 本次将安全生成 ZIP')
    : '生成后点击绿色按钮保存';
  $('#export-location-note').textContent = folderMode
    ? '仅已授权目录会直接写入；未选择时不会调用危险的宿主弹窗。'
    : '处理完成后由你明确点击保存，避免嵌入式浏览器意外退出。';
}

function updateAiModelUi(state) {
  const settings = getEffectiveSettings(state);
  const externalModel = getSelectedExternalModel(settings.ai.modelId);
  const metadata = installedAiModels.get(settings.ai.modelId);
  const ready = Boolean(metadata);
  const catalog = AI_MODEL_CATALOG[settings.ai.modelId];
  const status = $('#ai-model-status');
  if (settings.ai.modelId?.startsWith('external:')) {
    status.classList.remove('is-ready');
    status.querySelector('strong').textContent = externalModel
      ? `${externalModel.name} · ${externalModel.compatibility.label}`
      : '正在读取外部模型资料';
    status.querySelector('small').textContent = externalModel
      ? `${externalModel.runtime}；不会下载到像序缓存`
      : '外部模型不能直接用于当前处理流水线';
    $('#ai-enabled').disabled = true;
    $('#ai-delete-model').disabled = true;
    $('#ai-download-model').disabled = aiOperationRunning || !externalModel?.links?.length;
    $('#ai-download-model').textContent = '查看下载与适配方案';
    $('#ai-cancel-model-download').classList.add('is-hidden');
    $('#ai-model-select').disabled = aiOperationRunning;
    $('#pipeline-ai-status').textContent = '外部模型需转换适配';
    $('#pipeline-ai-status').closest('li').classList.remove('is-on');
    $('#pipeline-ai-status').closest('li').classList.add('is-off');
    if (settings.ai.enabled) queueMicrotask(() => actions.updateSetting('ai.enabled', false));
    return;
  }
  status.classList.toggle('is-ready', ready);
  status.querySelector('strong').textContent = ready ? `${metadata.name} · ${metadata.builtin ? '内置离线' : metadata.version}` : `${catalog?.name || settings.ai.modelId} 未安装`;
  status.querySelector('small').textContent = ready
    ? `${formatBytes(metadata.size)} · ${metadata.builtin ? '无需联网 · ' : ''}SHA-256 ${metadata.checksum.slice(0, 12)}…`
    : `按需安装 · ${catalog?.sizeHint || ''}`;
  $('#ai-enabled').disabled = !ready || aiOperationRunning;
  $('#ai-delete-model').disabled = !ready || metadata.builtin || aiOperationRunning;
  $('#ai-download-model').disabled = aiOperationRunning || Boolean(metadata?.builtin) || !catalog?.url;
  $('#ai-download-model').textContent = metadata?.builtin ? '已内置' : !catalog?.url ? '源码版未附模型' : ready ? '重新下载模型' : '下载所选模型';
  $('#ai-cancel-model-download').classList.toggle('is-hidden', !aiDownloadController);
  $('#ai-cancel-model-download').disabled = !aiDownloadController;
  $('#ai-model-select').disabled = aiOperationRunning;
  syncPipelineStep('#pipeline-ai-status', ready && settings.ai.enabled, ready ? `${metadata.name}${metadata.builtin ? ' · 内置' : ''}` : '未安装模型');
  if (!ready) $('#pipeline-ai-status').textContent = '未安装模型';
  if (!ready && settings.ai.enabled) queueMicrotask(() => actions.updateSetting('ai.enabled', false));
}

async function refreshAiModels() {
  installedAiModels = new Map((await listInstalledModels()).map((model) => [model.id, model]));
  try { await ensureExternalModelCatalog(); }
  catch { /* 外部资料目录不可用时不影响两个内置模型。 */ }
  updateAiModelUi(store.getState());
}

async function chooseExportDirectory() {
  if (getRuntimeHost() !== 'browser') {
    toast('当前为嵌入式运行环境，已禁用可能导致宿主退出的文件夹弹窗；请使用安全 ZIP 保存', 'warning', 7000);
    return null;
  }
  if (!window.showDirectoryPicker) {
    toast('当前浏览器不支持直接写入文件夹，请改用 ZIP 导出', 'warning', 5000);
    return null;
  }
  try {
    const options = { id: 'xiangxu-export', mode: 'readwrite', startIn: exportDirectoryHandle || 'downloads' };
    const handle = await window.showDirectoryPicker(options);
    exportDirectoryHandle = handle;
    await saveExportDirectoryHandle(handle);
    updateExportLocationUi('folder');
    toast(`默认导出位置：${handle.name}`);
    return handle;
  } catch (error) {
    if (error?.name !== 'AbortError') {
      const message = error?.name === 'NotAllowedError'
        ? '浏览器未允许打开文件夹选择器，请直接点击“选择文件夹”后重试'
        : `无法选择文件夹：${error.message}`;
      toast(message, 'error', 5000);
    }
    return null;
  }
}


function bindNumber(selector, path, minimum = 0, maximum = 16384) {
  $(selector).addEventListener('input', (event) => {
    const parsed = Number(event.target.value);
    if (!Number.isFinite(parsed)) return;
    actions.updateSetting(path, Math.min(maximum, Math.max(minimum, Math.round(parsed))));
  });
}

function bindHexColorText(textSelector, pickerSelector, path, label) {
  const input = $(textSelector);
  input.addEventListener('input', (event) => {
    const value = event.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting(path, value.toLowerCase());
  });
  input.addEventListener('change', (event) => {
    const value = event.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting(path, value.toLowerCase());
    else {
      toast(`请输入有效的${label}，例如 #FFFFFF`, 'warning');
      const current = getEffectiveSettings(store.getState()).color[path.split('.').at(-1)];
      event.target.value = current.toUpperCase();
      $(pickerSelector).value = current;
    }
  });
}

function beginColorPicking(path, label) {
  const state = store.getState();
  if (!getImageById(state, state.activeImageId)) {
    toast('请先导入并选择一张图片', 'warning');
    return;
  }
  if (colorPickerState?.path === path) {
    cancelColorPicking();
    return;
  }
  setAiBrushMode('off');
  colorPickerState = {
    path,
    label,
    previousPreviewMode: colorPickerState?.previousPreviewMode || state.previewMode
  };
  syncColorPickerUi();
  if (state.previewMode !== 'original') actions.setPreviewMode('original');
}

function cancelColorPicking(restorePreview = true) {
  if (!colorPickerState) return;
  const previousPreviewMode = colorPickerState.previousPreviewMode;
  colorPickerState = null;
  syncColorPickerUi();
  if (restorePreview && store.getState().previewMode !== previousPreviewMode) actions.setPreviewMode(previousPreviewMode);
}

function pickColorFromPreview(event) {
  if (!colorPickerState) return false;
  const canvas = $('#preview-canvas');
  const rect = canvas.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) return true;
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height)));
  try {
    const [red, green, blue, alpha] = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    if (!alpha) {
      toast('该位置是完全透明像素，请选择有颜色的区域', 'warning');
      return true;
    }
    const picker = colorPickerState;
    const hex = `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    colorPickerState = null;
    syncColorPickerUi();
    actions.updateSetting(picker.path, hex);
    toast(`已吸取${picker.label}：${hex.toUpperCase()}`);
  } catch (error) {
    toast(`吸色失败：${error.message}`, 'error');
  }
  return true;
}

store.subscribe(render);
bindSettingsPanel($('#settings-panel'));
document.querySelectorAll('.switch-row input[type="checkbox"]').forEach((input) => input.setAttribute('role', 'switch'));
$('.pipeline-flow').addEventListener('click', (event) => openPipelineSection(event.target.closest('[data-section-target]')));
$('.pipeline-flow').addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const step = event.target.closest('[data-section-target]');
  if (!step) return;
  event.preventDefault();
  openPipelineSection(step);
});

function openPipelineSection(step) {
  if (!step) return;
  const section = document.getElementById(step.dataset.sectionTarget);
  if (!section) return;
  section.classList.add('expanded');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  section.querySelector('.setting-title')?.focus({ preventScroll: true });
}

async function runAiModelOperation(operation) {
  aiOperationRunning = true;
  updateAiProgress(2, '准备模型操作');
  updateAiModelUi(store.getState());
  try { return await operation(); }
  finally {
    aiOperationRunning = false;
    updateAiProgress(100, '模型已就绪');
    await refreshAiModels();
  }
}

$('#ai-enabled').addEventListener('change', (event) => actions.updateSetting('ai.enabled', event.target.checked));
$('#ai-model-select').addEventListener('change', (event) => actions.updateSetting('ai.modelId', event.target.value));
$('#ai-threshold').addEventListener('input', (event) => actions.updateSetting('ai.threshold', Number(event.target.value)));
$('#ai-softness').addEventListener('input', (event) => actions.updateSetting('ai.softness', Number(event.target.value)));
$('#ai-feather').addEventListener('input', (event) => actions.updateSetting('ai.feather', Number(event.target.value)));
$('#ai-edge-shift').addEventListener('input', (event) => actions.updateSetting('ai.edgeShift', Number(event.target.value)));
$('#ai-brush-size').addEventListener('input', (event) => actions.updateSetting('ai.brushSize', Number(event.target.value)));
document.querySelectorAll('[data-ai-brush-mode]').forEach((button) => button.addEventListener('click', () => setAiBrushMode(button.dataset.aiBrushMode)));
$('#ai-brush-exit').addEventListener('click', () => setAiBrushMode('off'));
$('#ai-brush-clear').addEventListener('click', () => {
  if (!confirm('清除当前图片的全部画笔修补吗？AI 自动生成的原始 Mask 会保留。')) return;
  actions.clearAiMaskEdits();
});
$('#ai-reset-adjustments').addEventListener('click', () => {
  setAiBrushMode('off');
  actions.resetAiMaskAdjustments();
  toast('已还原抠图参数并清除当前图片的手工笔触');
});
$('#open-external-models').addEventListener('click', () => openExternalModelLibrary());
$('#close-external-models').addEventListener('click', () => $('#external-model-dialog').close());
$('#close-external-models-footer').addEventListener('click', () => $('#external-model-dialog').close());
$('#external-model-list').addEventListener('click', (event) => {
  const clickTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
  const link = clickTarget?.closest('[data-external-url]');
  if (!link) return;
  event.preventDefault();
  requestExternalLink(link);
});
$('#cancel-external-link').addEventListener('click', cancelExternalLink);
$('#cancel-external-link-icon').addEventListener('click', cancelExternalLink);
$('#confirm-external-link').addEventListener('click', openPendingExternalLink);
$('#external-link-dialog').addEventListener('close', () => { pendingExternalLink = null; });
$('#ai-download-model').addEventListener('click', async () => {
  const id = $('#ai-model-select').value;
  if (id.startsWith('external:')) {
    try {
      await ensureExternalModelCatalog();
      const model = getSelectedExternalModel(id);
      if (!model) throw new Error('找不到所选外部模型');
      await openExternalModelLibrary(model.id);
    } catch (error) {
      toast(`无法打开模型资料：${error.message}`, 'error', 6000);
    }
    return;
  }
  const catalog = AI_MODEL_CATALOG[id];
  aiDownloadController = new AbortController();
  try {
    await runAiModelOperation(async () => {
      await downloadAndInstallModel(id, (progress, received, total) => {
        const detail = total ? `下载模型 ${formatBytes(received)} / ${formatBytes(total)}` : `下载模型 ${formatBytes(received)}`;
        updateAiProgress(progress, detail);
      }, { signal: aiDownloadController.signal });
      clearAiMaskCache(id);
      toast(`${catalog.name} 已下载、检测并缓存`);
    });
  } catch (error) {
    toast(error?.name === 'AbortError' ? '模型下载已取消' : `模型下载失败：${error.message}`, error?.name === 'AbortError' ? 'warning' : 'error', 7000);
  } finally {
    aiDownloadController = null;
    updateAiModelUi(store.getState());
  }
});
$('#ai-cancel-model-download').addEventListener('click', () => aiDownloadController?.abort());
$('#ai-delete-model').addEventListener('click', async () => {
  const id = $('#ai-model-select').value;
  if (!confirm(`确定删除本地缓存的 ${id} 模型吗？`)) return;
  await runAiModelOperation(async () => { await deleteModel(id); clearAiMaskCache(id); actions.updateSetting('ai.enabled', false); toast(`${id} 模型已删除`); });
});
$('#choose-export-folder').addEventListener('click', chooseExportDirectory);

$('#trim-enabled').addEventListener('change', (event) => actions.updateSetting('trim.enabled', event.target.checked));
$('#trim-mode').addEventListener('change', (event) => actions.updateSetting('trim.mode', event.target.value));
$('#trim-color').addEventListener('input', (event) => actions.updateSetting('trim.color', event.target.value));
$('#trim-color-text').addEventListener('input', (event) => { const value = event.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting('trim.color', value.toLowerCase()); });
$('#trim-color-text').addEventListener('change', (event) => {
  const value = event.target.value.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting('trim.color', value.toLowerCase());
  else { toast('请输入有效的去边颜色，例如 #FFFFFF', 'warning'); syncSettingsControls(getEffectiveSettings(store.getState())); }
});
$('#trim-tolerance').addEventListener('input', (event) => actions.updateSetting('trim.tolerance', Number(event.target.value)));
bindNumber('#trim-padding', 'trim.padding', 0, 2048);
$('#resize-enabled').addEventListener('change', (event) => actions.updateSetting('resize.enabled', event.target.checked));
bindNumber('#resize-width', 'resize.width', 1);
bindNumber('#resize-height', 'resize.height', 1);
$('#resize-mode').addEventListener('change', (event) => actions.updateSetting('resize.mode', event.target.value));
$('#resize-quality').addEventListener('change', (event) => actions.updateSetting('resize.quality', event.target.value));
$('#crop-enabled').addEventListener('change', (event) => actions.updateSetting('crop.enabled', event.target.checked));
$('#crop-mode').addEventListener('change', (event) => actions.updateSetting('crop.mode', event.target.value));
bindNumber('#crop-free-width', 'crop.freeWidth', 5, 100);
bindNumber('#crop-free-height', 'crop.freeHeight', 5, 100);
bindNumber('#crop-ratio-width', 'crop.customRatioWidth', 1, 100);
bindNumber('#crop-ratio-height', 'crop.customRatioHeight', 1, 100);
$('#crop-zoom').addEventListener('input', (event) => actions.setCropZoom(Number(event.target.value)));
$('#crop-guides-select').addEventListener('change', (event) => actions.updateSetting('crop.guides', event.target.value));
$('#reset-crop-position').addEventListener('click', () => actions.resetCropPosition());
$('#mask-enabled').addEventListener('change', (event) => actions.updateSetting('mask.enabled', event.target.checked));
$('#mask-type').addEventListener('change', (event) => actions.updateSetting('mask.type', event.target.value));
bindNumber('#mask-radius', 'mask.radius', 0, 4096);
$('#canvas-enabled').addEventListener('change', (event) => actions.updateSetting('canvas.enabled', event.target.checked));
bindNumber('#canvas-width', 'canvas.width', 1);
bindNumber('#canvas-height', 'canvas.height', 1);
$('#background-type').addEventListener('change', (event) => actions.updateSetting('canvas.background.type', event.target.value));
$('#background-color').addEventListener('input', (event) => actions.updateSetting('canvas.background.color', event.target.value));
$('#background-color-text').addEventListener('change', (event) => {
  const value = event.target.value.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting('canvas.background.color', value.toLowerCase());
  else { toast('请输入有效的十六进制颜色，例如 #FFFFFF', 'warning'); syncSettingsControls(getEffectiveSettings(store.getState())); }
});
$('#output-format').addEventListener('change', (event) => actions.updateSetting('output.format', event.target.value));
$('#output-quality').addEventListener('input', (event) => actions.updateSetting('output.quality', Number(event.target.value)));
$('#export-mode').addEventListener('change', (event) => actions.updateSetting('output.mode', event.target.value));
$('#jpeg-background').addEventListener('input', (event) => actions.updateSetting('output.jpegBackground', event.target.value));
$('#jpeg-background-text').addEventListener('change', (event) => {
  const value = event.target.value.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting('output.jpegBackground', value.toLowerCase());
  else { toast('请输入有效的 JPG 背景颜色', 'warning'); syncSettingsControls(getEffectiveSettings(store.getState())); }
});
$('#filename-template').addEventListener('input', (event) => actions.updateSetting('output.filenameTemplate', event.target.value));
bindNumber('#sequence-start', 'output.sequenceStart', 0, 999999);
bindNumber('#sequence-digits', 'output.sequenceDigits', 1, 8);
bindNumber('#margin-all', 'position.margin', 0, 8192);
bindNumber('#offset-x', 'position.offsetX', -8192, 8192);
bindNumber('#offset-y', 'position.offsetY', -8192, 8192);
$('#subject-enabled').addEventListener('change', (event) => actions.updateSetting('subject.enabled', event.target.checked));
bindNumber('#subject-width', 'subject.widthPercent', 5, 100);
bindNumber('#subject-height', 'subject.heightPercent', 5, 100);
$('#color-enabled').addEventListener('change', (event) => actions.updateSetting('color.enabled', event.target.checked));
document.querySelectorAll('[data-color-mode]').forEach((button) => button.addEventListener('click', () => {
  cancelColorPicking(false);
  actions.updateSetting('color.mode', button.dataset.colorMode);
}));
document.querySelectorAll('[data-color-picker-path]').forEach((button) => button.addEventListener('click', () => {
  const label = button.dataset.colorPickerPath === 'color.target' ? '目标颜色' : '来源颜色';
  beginColorPicking(button.dataset.colorPickerPath, label);
}));
$('#color-source').addEventListener('input', (event) => actions.updateSetting('color.source', event.target.value));
$('#color-target').addEventListener('input', (event) => actions.updateSetting('color.target', event.target.value));
bindHexColorText('#color-source-text', '#color-source', 'color.source', '来源颜色');
bindHexColorText('#color-target-text', '#color-target', 'color.target', '目标颜色');
$('#color-tolerance').addEventListener('input', (event) => actions.updateSetting('color.tolerance', Number(event.target.value)));
$('#color-exposure').addEventListener('input', (event) => actions.updateSetting('color.exposure', Number(event.target.value)));
$('#color-brightness').addEventListener('input', (event) => actions.updateSetting('color.brightness', Number(event.target.value)));
$('#color-contrast').addEventListener('input', (event) => actions.updateSetting('color.contrast', Number(event.target.value)));
$('#color-saturation').addEventListener('input', (event) => actions.updateSetting('color.saturation', Number(event.target.value)));
$('#color-temperature').addEventListener('input', (event) => actions.updateSetting('color.temperature', Number(event.target.value)));
$('#color-tint').addEventListener('input', (event) => actions.updateSetting('color.tint', Number(event.target.value)));
$('#color-hue').addEventListener('input', (event) => actions.updateSetting('color.hue', Number(event.target.value)));
$('#color-opacity').addEventListener('input', (event) => actions.updateSetting('color.opacity', Number(event.target.value)));
document.querySelectorAll('[data-curve-channel]').forEach((button) => button.addEventListener('click', () => {
  activeCurveChannel = button.dataset.curveChannel;
  syncCurveControls(getEffectiveSettings(store.getState()).color);
}));
['shadows', 'midtones', 'highlights'].forEach((tone) => {
  $(`#curve-${tone}`).addEventListener('input', (event) => actions.updateSetting(`color.curves.${activeCurveChannel}.${tone}`, Number(event.target.value)));
});
$('#reset-color-settings').addEventListener('click', () => {
  activeCurveChannel = 'rgb';
  actions.resetColorSettings();
  toast('颜色设置已还原');
});
$('#watermark-enabled').addEventListener('change', (event) => actions.updateSetting('watermark.enabled', event.target.checked));
$('#watermark-type').addEventListener('change', (event) => actions.updateSetting('watermark.type', event.target.value));
$('#watermark-text').addEventListener('input', (event) => actions.updateSetting('watermark.text', event.target.value));
bindNumber('#watermark-size', 'watermark.fontSize', 8, 512);
bindNumber('#watermark-opacity', 'watermark.opacity', 1, 100);
$('#watermark-alignment').addEventListener('change', (event) => actions.updateSetting('watermark.alignment', event.target.value));
$('#watermark-tiled').addEventListener('change', (event) => actions.updateSetting('watermark.tiled', event.target.checked));
bindNumber('#watermark-image-scale', 'watermark.imageScale', 1, 100);
$('#watermark-image-input').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    await preloadWatermarkImage(dataUrl); actions.updateSetting('watermark.imageDataUrl', dataUrl); actions.updateSetting('watermark.imageName', file.name); toast(`已载入水印图片：${file.name}`);
  } catch (error) { toast(error.message, 'error'); }
});
$('#clear-watermark-image').addEventListener('click', () => { actions.updateSetting('watermark.imageDataUrl', ''); actions.updateSetting('watermark.imageName', ''); $('#watermark-image-input').value = ''; toast('已移除水印图片'); });
$('#target-size-enabled').addEventListener('change', (event) => actions.updateSetting('compression.targetEnabled', event.target.checked));
bindNumber('#target-size-kb', 'compression.targetKB', 1, 102400);
bindNumber('#target-min-quality', 'compression.minQuality', 1, 100);
$('#target-allow-resize').addEventListener('change', (event) => actions.updateSetting('compression.allowResize', event.target.checked));
bindNumber('#sprite-cell-width', 'sprite.cellWidth', 1, 4096);
bindNumber('#sprite-cell-height', 'sprite.cellHeight', 1, 4096);
bindNumber('#sprite-columns', 'sprite.columns', 1, 100);
bindNumber('#sprite-gap', 'sprite.gap', 0, 256);
$('#sprite-auto-columns').addEventListener('change', (event) => actions.updateSetting('sprite.autoColumns', event.target.checked));
$('#sprite-power-of-two').addEventListener('change', (event) => actions.updateSetting('sprite.powerOfTwo', event.target.checked));
$('#sprite-sort').addEventListener('change', (event) => actions.updateSetting('sprite.sort', event.target.value));
$('#sprite-background-type').addEventListener('change', (event) => {
  actions.updateSetting('sprite.backgroundType', event.target.value);
  if (event.target.value === 'solid' && getEffectiveSettings(store.getState()).sprite.background === '#00000000') actions.updateSetting('sprite.background', '#ffffff');
});
$('#sprite-background').addEventListener('input', (event) => actions.updateSetting('sprite.background', event.target.value));
$('#sprite-background-text').addEventListener('input', (event) => { const value = event.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting('sprite.background', value.toLowerCase()); });
$('#sprite-background-text').addEventListener('change', (event) => {
  const value = event.target.value.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) actions.updateSetting('sprite.background', value.toLowerCase());
  else { toast('请输入有效的 Sprite 背景颜色', 'warning'); syncSettingsControls(getEffectiveSettings(store.getState())); }
});
$('#sprite-filename').addEventListener('input', (event) => actions.updateSetting('sprite.filename', event.target.value));
bindNumber('#inspect-max-kb', 'inspection.maxKB', 1, 102400);
$('#inspect-min-side').addEventListener('input', (event) => { const value = Math.min(16384, Math.max(1, Math.round(Number(event.target.value) || 1))); actions.updateSetting('inspection.minWidth', value); actions.updateSetting('inspection.minHeight', value); });
document.querySelectorAll('[data-alignment]').forEach((button) => button.addEventListener('click', () => actions.updateSetting('position.alignment', button.dataset.alignment)));
document.querySelectorAll('[data-preview-mode]').forEach((button) => button.addEventListener('click', () => actions.setPreviewMode(button.dataset.previewMode)));
$('#reset-settings-button').addEventListener('click', () => actions.resetSettings());
$('#start-processing-button').addEventListener('click', startProcessing);
$('#pause-button').addEventListener('click', () => {
  if (!exportController) return;
  exportController.paused = !exportController.paused;
  actions.updateProcessing({ paused: exportController.paused }, 'processing:pause');
  actions.appendLog(exportController.paused ? '任务已暂停。' : '任务继续。');
});
$('#cancel-button').addEventListener('click', () => {
  if (!exportController) return;
  exportController.cancelled = true;
  exportController.paused = false;
  actions.appendLog('正在取消任务…', 'warning');
});
$('#view-log-button').addEventListener('click', () => $('#log-dialog').showModal());
$('#close-log-button').addEventListener('click', () => $('#log-dialog').close());
$('#undo-button').addEventListener('click', () => store.undo());
$('#redo-button').addEventListener('click', () => store.redo());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && colorPickerState) {
    event.preventDefault();
    cancelColorPicking();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); store.undo(); }
  if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) { event.preventDefault(); store.redo(); }
});

$('#run-inspection-button').addEventListener('click', async () => {
  const button = $('#run-inspection-button'); button.disabled = true; button.textContent = '正在扫描…';
  try {
    const state = store.getState();
    inspectionResults = await inspectImages(state.images, state.settings, state.settings.inspection, (imageId) => getEffectiveSettings(state, imageId));
    const issueCount = inspectionResults.reduce((sum, result) => sum + result.issues.length, 0);
    const customCount = inspectionResults.filter((result) => result.settingsMode === 'custom').length;
    $('#inspection-summary').textContent = `${inspectionResults.length - customCount} 张统一 · ${customCount} 张自定义 · ${issueCount} 个问题`;
    $('#inspection-list').innerHTML = inspectionResults.map((result) => `<article class="inspection-item"><div><strong>${escapeHtml(result.name)}</strong><span>${result.width}×${result.height} · ${formatBytes(result.size)}</span></div><ul>${result.issues.length ? result.issues.map((issue) => `<li class="${issue.level}">${escapeHtml(issue.message)}</li>`).join('') : '<li class="success">未发现问题</li>'}</ul></article>`).join('');
    $('#inspection-dialog').showModal();
  } catch (error) { toast(`文件检查失败：${error.message}`, 'error'); }
  finally { button.disabled = store.getState().images.length === 0; button.textContent = '扫描当前队列'; }
});
$('#close-inspection-dialog').addEventListener('click', () => $('#inspection-dialog').close());
$('#export-inspection-report').addEventListener('click', async () => {
  if (!inspectionResults.length) return toast('请先扫描当前队列', 'warning');
  await downloadBlob(new Blob([inspectionToMarkdown(inspectionResults)], { type: 'text/markdown;charset=utf-8' }), 'image-inspection-report.md');
});
$('#export-sprite-button').addEventListener('click', async () => {
  const button = $('#export-sprite-button'); button.disabled = true; button.textContent = '正在生成…';
  try {
    const state = store.getState();
    const result = await createSpritePackage(state.images, structuredClone(state.settings), (done, total) => { button.textContent = `生成 ${done}/${total}`; }, (imageId) => structuredClone(getEffectiveSettings(state, imageId)));
    await downloadBlob(result.blob, `${result.base}-package.zip`); toast(`Sprite ${result.width}×${result.height} 已生成（${formatBytes(result.blob.size)}）`);
  } catch (error) { toast(`Sprite 生成失败：${error.message}`, 'error', 5000); }
  finally { button.disabled = store.getState().images.length === 0; button.textContent = '导出 Sprite 与清单'; }
});

$('#open-presets-button').addEventListener('click', async () => {
  await refreshPresets();
  $('#preset-library-dialog').showModal();
});
$('#close-preset-library').addEventListener('click', () => $('#preset-library-dialog').close());
$('#preset-search').addEventListener('input', renderPresetLibrary);
$('#preset-filter').addEventListener('change', renderPresetLibrary);
$('#preset-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-preset-action]');
  const item = event.target.closest('[data-preset-id]');
  if (!button || !item) return;
  const preset = allPresets().find((candidate) => candidate.id === item.dataset.presetId);
  if (!preset) return;
  try {
    if (button.dataset.presetAction === 'apply') await applySelectedPreset(preset);
    if (button.dataset.presetAction === 'export') await exportPreset(preset);
    if (button.dataset.presetAction === 'favorite') {
      if (preset.system) {
        systemPresetMeta[preset.id] = { ...(systemPresetMeta[preset.id] || {}), favorite: !preset.favorite };
        localStorage.setItem(SYSTEM_META_KEY, JSON.stringify(systemPresetMeta));
      } else await updateUserPreset(preset.id, { favorite: !preset.favorite });
      await refreshPresets();
    }
    if (button.dataset.presetAction === 'delete' && await confirmAction(`确定删除用户预设“${preset.name}”吗？此操作无法撤销。`)) {
      await deleteUserPreset(preset.id);
      if (store.getState().preset.id === preset.id) actions.setPresetIdentity(null, '未命名任务');
      await refreshPresets();
      toast(`已删除预设：${preset.name}`);
    }
  } catch (error) { toast(`预设操作失败：${error.message}`, 'error'); }
});

async function openSavePresetDialog() {
  const state = store.getState();
  const customCount = getCustomImageCount(state);
  if (customCount) {
    const proceed = await confirmAction(`预设只保存统一设置。当前有 ${customCount} 张图片使用自定义设置，这些单图调整不会写入预设。`, { title: '预设只保存统一设置', confirmText: '继续保存' });
    if (!proceed) return;
  }
  const current = userPresets.find((preset) => preset.id === state.preset.id);
  $('#preset-name-input').value = current?.name || (state.preset.id ? `${state.preset.name} 副本` : '我的预设');
  $('#preset-description-input').value = current?.description || '';
  $('#overwrite-preset').checked = Boolean(current);
  $('#overwrite-preset-row').classList.toggle('is-hidden', !current);
  $('#save-dialog-title').textContent = current ? '重命名或覆盖预设' : '命名并保存当前配置';
  $('#save-preset-dialog').showModal();
  $('#preset-name-input').focus();
  $('#preset-name-input').select();
}

$('#save-preset-button').addEventListener('click', () => openSavePresetDialog());
$('#current-preset-name').addEventListener('click', () => openSavePresetDialog());
$('#save-preset-form').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const state = store.getState();
  const current = userPresets.find((preset) => preset.id === state.preset.id);
  const overwrite = Boolean(current && $('#overwrite-preset').checked);
  try {
    const saved = await saveUserPreset({
      ...(overwrite ? current : {}),
      id: overwrite ? current.id : undefined,
      name: $('#preset-name-input').value,
      description: $('#preset-description-input').value,
      settings: structuredClone(state.settings)
    });
    actions.setPresetIdentity(saved.id, saved.name);
    await refreshPresets();
    $('#save-preset-dialog').close();
    toast(overwrite ? `已覆盖预设：${saved.name}` : `已保存预设：${saved.name}`);
  } catch (error) { toast(`保存失败：${error.message}`, 'error'); }
});

$('#import-preset-button').addEventListener('click', () => {
  $('#preset-json-input').value = '';
  $('#preset-file-input').value = '';
  $('#import-preset-dialog').showModal();
});

function closeImportPresetDialog() {
  $('#import-preset-dialog').close('cancel');
}

$('#close-import-preset-dialog').addEventListener('click', closeImportPresetDialog);
$('#cancel-import-preset-dialog').addEventListener('click', closeImportPresetDialog);
$('#import-preset-dialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeImportPresetDialog();
});
$('#import-preset-dialog').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeImportPresetDialog();
  }
});

$('#preset-file-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) $('#preset-json-input').value = await file.text();
});
$('#import-preset-form').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  try {
    const presets = parsePresetJson($('#preset-json-input').value);
    for (const preset of presets) await saveUserPreset(preset);
    await refreshPresets();
    $('#import-preset-dialog').close();
    toast(`已导入 ${presets.length} 个预设`);
  } catch (error) { toast(`导入失败：${error.message}`, 'error', 5000); }
});
$('#export-preset-button').addEventListener('click', async () => {
  const state = store.getState();
  await exportPreset({ id: state.preset.id, name: state.preset.name, description: '', settings: state.settings });
});
$('#add-images-button').addEventListener('click', () => $('#file-input').click());
$('#empty-add-button').addEventListener('click', () => $('#file-input').click());
$('#add-folder-button').addEventListener('click', () => $('#folder-input').click());
$('#file-input').addEventListener('change', (event) => handleFiles(event.target.files));
$('#folder-input').addEventListener('change', (event) => handleFiles(event.target.files, '文件夹'));
$('#paste-button').addEventListener('click', async () => {
  try {
    const files = await filesFromClipboard();
    if (!files.length) toast('剪贴板中没有可读取的图片', 'warning');
    else await handleFiles(files, '剪贴板');
  } catch {
    toast('浏览器未授权读取剪贴板，请直接按 Ctrl+V 粘贴', 'warning', 5000);
  }
});
document.addEventListener('paste', async (event) => {
  if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const files = await filesFromClipboard(event);
  if (files.length) { event.preventDefault(); await handleFiles(files, '剪贴板'); }
});
$('#search-input').addEventListener('input', (event) => actions.setQuery(event.target.value));
$('#sort-select').addEventListener('change', (event) => actions.setSort(event.target.value));
$('#settings-mode-filter').addEventListener('change', (event) => actions.setSettingsFilter(event.target.value));
$('#image-settings-mode').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-settings-mode]');
  if (!button || button.disabled) return;
  const state = store.getState();
  const image = getImageById(state, state.activeImageId);
  if (!image) return;
  if (button.dataset.settingsMode === image.settingsMode) return;
  if (button.dataset.settingsMode === 'custom') {
    actions.enableCustomSettings(image.id);
    toast('已转为自定义设置；后续修改只影响当前图片');
    return;
  }
  if (image.settingsMode === 'custom') {
    const confirmed = await confirmAction('当前图片的独立调整将被清除，并立即使用当前统一参数。此操作可以通过撤销恢复。', { title: '恢复统一设置？', confirmText: '恢复统一设置' });
    if (confirmed) {
      actions.restoreGlobalSettings(image.id);
      toast('已恢复统一设置');
    } else render(store.getState(), 'image-settings:cancel-restore');
  }
});
$('#select-all-checkbox').addEventListener('change', (event) => actions.selectAll(getVisibleImages(store.getState()).map((image) => image.id), event.target.checked));
$('#delete-selected-button').addEventListener('click', () => actions.removeImages([...store.getState().selectedIds]));
$('#clear-button').addEventListener('click', () => { if (confirm('确定清空全部图片吗？原始文件不会被删除。')) actions.clearImages(); });
$('#new-task-button').addEventListener('click', () => {
  if (!store.getState().taskDirty) return;
  if (confirm('确定新建任务吗？当前图片、设置和未保存的任务状态将被清空，原始文件不会被删除。')) actions.newTask();
});
$('#zoom-in-button').addEventListener('click', () => actions.setZoom(store.getState().zoom + 0.1));
$('#zoom-out-button').addEventListener('click', () => actions.setZoom(store.getState().zoom - 0.1));
$('#fit-button').addEventListener('click', () => actions.setZoom(1));
document.querySelectorAll('.swatch').forEach((swatch) => swatch.addEventListener('click', () => actions.setBackground(swatch.dataset.background)));
$('#preview-stage').addEventListener('wheel', (event) => {
  if (!store.getState().activeImageId) return;
  event.preventDefault();
  const state = store.getState();
  const settings = getEffectiveSettings(state);
  if (aiBrushMode !== 'off') {
    actions.setZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  } else if (state.previewMode === 'processed' && settings.crop.enabled) {
    actions.setCropZoom(settings.crop.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  } else {
    actions.setZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }
}, { passive: false });

let cropDragging = false;
let cropPointer = { x: 0, y: 0 };
$('#canvas-wrap').addEventListener('pointerdown', (event) => {
  if (pickColorFromPreview(event)) {
    event.preventDefault();
    return;
  }
  const state = store.getState();
  const brushPoint = getAiBrushPoint(event, state);
  if (aiBrushMode !== 'off' && brushPoint && getEffectiveSettings(state).ai.enabled) {
    aiBrushPainting = true;
    aiBrushDraft = { mode: aiBrushMode, size: getEffectiveSettings(state).ai.brushSize, points: [brushPoint] };
    beginAiBrushOverlay(brushPoint, aiBrushDraft);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return;
  }
  if (aiBrushMode !== 'off') { event.preventDefault(); return; }
  if (!(state.previewMode === 'processed' && getEffectiveSettings(state).crop.enabled)) return;
  cropDragging = true;
  cropPointer = { x: event.clientX, y: event.clientY };
  event.currentTarget.classList.add('is-dragging');
  event.currentTarget.setPointerCapture?.(event.pointerId);
});
$('#canvas-wrap').addEventListener('pointermove', (event) => {
  updateAiBrushCursor(event);
  if (aiBrushPainting) {
    const point = getAiBrushPoint(event, store.getState());
    const previous = aiBrushDraft?.points?.at(-1);
    if (point && previous && Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.0015 && aiBrushDraft.points.length < 4000) {
      aiBrushDraft.points.push(point);
      drawAiBrushOverlaySegment(previous, point, aiBrushDraft);
    }
    event.preventDefault();
    return;
  }
  if (!cropDragging) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const state = store.getState();
  const cropSettings = getEffectiveSettings(state).crop;
  const deltaX = -(event.clientX - cropPointer.x) / Math.max(1, rect.width) / cropSettings.zoom;
  const deltaY = -(event.clientY - cropPointer.y) / Math.max(1, rect.height) / cropSettings.zoom;
  cropPointer = { x: event.clientX, y: event.clientY };
  actions.panCrop(deltaX, deltaY);
});
function stopCropDrag(event) {
  if (aiBrushPainting) {
    aiBrushPainting = false;
    const draft = aiBrushDraft;
    aiBrushDraft = null;
    if (draft?.points?.length) actions.commitAiMaskStroke(draft.mode, draft.size, draft.points);
  }
  cropDragging = false;
  event.currentTarget.classList.remove('is-dragging');
}
$('#canvas-wrap').addEventListener('pointerup', stopCropDrag);
$('#canvas-wrap').addEventListener('pointercancel', stopCropDrag);
$('#canvas-wrap').addEventListener('pointerleave', () => { if (!aiBrushPainting) $('#ai-brush-cursor').classList.add('is-hidden'); });
$('#canvas-wrap').addEventListener('dblclick', () => {
  if (aiBrushMode !== 'off') return;
  const state = store.getState();
  if (state.previewMode === 'processed' && getEffectiveSettings(state).crop.enabled) actions.resetCropPosition();
});

function getAiBrushPoint(event, state) {
  if (aiBrushMode === 'off' || state.previewMode !== 'processed') return null;
  const canvas = $('#preview-canvas');
  const image = getImageById(state, state.activeImageId);
  if (!image) return null;
  const rect = canvas.getBoundingClientRect();
  const canvasX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
  const canvasY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
  const draw = (canvas.dataset.drawRect || '').split(',').map(Number);
  const source = (canvas.dataset.sourceRect || '').split(',').map(Number);
  return mapCanvasPointToSource(canvasX, canvasY, draw, source, image.width, image.height);
}

function updateAiBrushCursor(event) {
  const cursor = $('#ai-brush-cursor');
  if (aiBrushMode === 'off') { cursor.classList.add('is-hidden'); return; }
  const point = getAiBrushPoint(event, store.getState());
  if (!point) { cursor.classList.add('is-hidden'); return; }
  const wrapRect = $('#canvas-wrap').getBoundingClientRect();
  const image = getImageById(store.getState(), store.getState().activeImageId);
  const canvas = $('#preview-canvas');
  const draw = (canvas.dataset.drawRect || '').split(',').map(Number);
  const zoom = store.getState().zoom || 1;
  const local = toUnscaledLocalPoint(event.clientX, event.clientY, wrapRect, zoom);
  const displayScale = canvas.offsetWidth / Math.max(1, canvas.width);
  const diameter = Math.max(6, Math.min(180, (getEffectiveSettings(store.getState()).ai.brushSize * 2 / Math.max(1, image?.width || 1)) * (draw[2] || canvas.width) * displayScale));
  cursor.style.left = `${local.x}px`;
  cursor.style.top = `${local.y}px`;
  cursor.style.width = `${diameter}px`;
  cursor.style.height = `${diameter}px`;
  cursor.classList.remove('is-hidden');
}

function beginAiBrushOverlay(point, draft) {
  const overlay = $('#ai-brush-overlay');
  const canvas = $('#preview-canvas');
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const context = overlay.getContext('2d');
  context.clearRect(0, 0, overlay.width, overlay.height);
  drawAiBrushOverlaySegment(point, { ...point, canvasX: point.canvasX + 0.01 }, draft);
}

function drawAiBrushOverlaySegment(from, to, draft) {
  const overlay = $('#ai-brush-overlay');
  const canvas = $('#preview-canvas');
  const image = getImageById(store.getState(), store.getState().activeImageId);
  const draw = (canvas.dataset.drawRect || '').split(',').map(Number);
  if (!image || draw.length !== 4 || draw.some((value) => !Number.isFinite(value))) return;
  const radiusX = draft.size * draw[2] / Math.max(1, image.width);
  const radiusY = draft.size * draw[3] / Math.max(1, image.height);
  const context = overlay.getContext('2d');
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = draft.mode === 'add' ? 'rgba(37,99,235,.5)' : 'rgba(239,68,68,.52)';
  context.lineWidth = Math.max(2, Math.min(radiusX, radiusY) * 2);
  context.beginPath();
  context.moveTo(from.canvasX, from.canvasY);
  context.lineTo(to.canvasX, to.canvasY);
  context.stroke();
  context.restore();
}

function clearAiBrushOverlay() {
  const overlay = $('#ai-brush-overlay');
  const canvas = $('#preview-canvas');
  if (!overlay || !canvas) return;
  overlay.width = canvas.width || 1;
  overlay.height = canvas.height || 1;
}

let dragDepth = 0;
const dropZone = $('#drop-zone');
dropZone.addEventListener('dragenter', (event) => { event.preventDefault(); dragDepth += 1; dropZone.classList.add('is-dragging'); });
dropZone.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
dropZone.addEventListener('dragleave', (event) => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropZone.classList.remove('is-dragging'); });
dropZone.addEventListener('drop', async (event) => {
  event.preventDefault(); dragDepth = 0; dropZone.classList.remove('is-dragging');
  const files = await filesFromDataTransfer(event.dataTransfer);
  await handleFiles(files, '拖放');
});

window.addEventListener('beforeunload', () => {
  store.getState().images.forEach((image) => URL.revokeObjectURL(image.objectUrl));
  if (pendingDownloadUrl) URL.revokeObjectURL(pendingDownloadUrl);
});
render(store.getState(), 'init');
refreshPresets().catch((error) => toast(`读取预设失败：${error.message}`, 'error'));
refreshAiModels().catch((error) => toast(`读取 AI 模型失败：${error.message}`, 'error'));
loadExportDirectoryHandle().then((handle) => { exportDirectoryHandle = handle; updateExportLocationUi(store.getState().settings.output.mode); });

async function startProcessing() {
  const state = store.getState();
  if (!state.images.length || state.processing.running) return;
  clearPendingDownload();
  let targetDirectory = null;
  let safeZipFallback = false;
  if (state.settings.output.mode === 'folder' && window.showDirectoryPicker) {
    if (exportDirectoryHandle && await ensureDirectoryPermission(exportDirectoryHandle)) targetDirectory = exportDirectoryHandle;
    else safeZipFallback = true;
  } else if (state.settings.output.mode === 'folder') {
    safeZipFallback = true;
  }
  exportController = { paused: false, cancelled: false };
  actions.updateProcessing({ running: true, paused: false, progress: 0, completed: 0, failed: 0, pending: state.images.length, bytes: 0, logs: [] }, 'processing:start');
  actions.appendLog(`开始处理 ${state.images.length} 张图片，输出格式：${state.settings.output.format.toUpperCase()}。`);
  try {
    const exportSettings = structuredClone(state.settings);
    if (safeZipFallback) exportSettings.output.mode = 'zip';
    exportSettings.presetName = state.preset.name;
    if (safeZipFallback) actions.appendLog('未发现已授权的输出目录，本次改为安全生成 ZIP，避免调用宿主文件夹弹窗。', 'warning');
    const result = await runBatchExport([...state.images], exportSettings, {
      controller: exportController,
      directoryHandle: targetDirectory,
      getSettings: (imageId) => {
        const settings = structuredClone(getEffectiveSettings(state, imageId));
        settings.presetName = state.preset.name;
        return settings;
      },
      onLog: (message, level) => actions.appendLog(message, level),
      onProgress: ({ completed, failed, processed, total, bytes }) => actions.updateProcessing({ completed, failed, pending: total - processed, progress: Math.round((processed / total) * 100), bytes }, 'processing:progress')
    });
    if (result.fallbackToZip) toast('浏览器不支持文件夹写入，已回退为 ZIP', 'warning');
    if (result.zipBlob) {
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const saved = await downloadBlob(result.zipBlob, `image-batch-${date}.zip`);
      if (saved.cancelled) actions.appendLog('用户取消了文件保存。', 'warning');
      else if (saved.mode === 'desktop') actions.appendLog(`文件已保存：${saved.path || saved.filename}`, 'success');
      else actions.appendLog('ZIP 已生成，等待用户点击绿色保存按钮。', 'success');
    }
    if (result.cancelled) {
      actions.appendLog('任务已取消，未生成 ZIP。', 'warning');
      toast('任务已取消', 'warning');
    } else {
      actions.appendLog(`任务完成：成功 ${result.completed}，失败 ${result.failures.length}。`, result.failures.length ? 'warning' : 'success');
      toast(`处理完成：成功 ${result.completed} 张${result.failures.length ? `，失败 ${result.failures.length} 张` : ''}`);
    }
    actions.updateProcessing({ running: false, paused: false, completed: result.completed, failed: result.failures.length, pending: result.cancelled ? Math.max(0, state.images.length - result.completed - result.failures.length) : 0, progress: result.cancelled ? store.getState().processing.progress : 100, bytes: result.bytes }, 'processing:finish');
  } catch (error) {
    const cancelledByPicker = error?.name === 'AbortError';
    actions.appendLog(cancelledByPicker ? '用户取消了文件夹选择。' : `任务异常：${error.message}`, cancelledByPicker ? 'warning' : 'error');
    actions.updateProcessing({ running: false, paused: false }, 'processing:error');
    toast(cancelledByPicker ? '已取消文件夹选择' : `处理失败：${error.message}`, cancelledByPicker ? 'warning' : 'error');
  } finally {
    exportController = null;
  }
}
