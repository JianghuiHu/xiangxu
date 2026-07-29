import { createDefaultSettings } from './defaults.js?v=8';
import { getEffectiveSettings, getImageById } from './selectors.js';

const isTaskLevelSetting = (path) => path === 'output.mode' || path.startsWith('sprite.') || path.startsWith('inspection.');

export function createActions(store) {
  return {
    addImages(images) {
      if (!images.length) return;
      store.update((state) => {
        state.images.push(...images);
        state.taskDirty = true;
        state.activeImageId = images[0].id;
        state.processing.pending = state.images.length;
        if (!state.processing.running) {
          state.processing.completed = 0;
          state.processing.failed = 0;
          state.processing.progress = 0;
          state.processing.bytes = 0;
        }
      }, 'images:add');
    },
    setActive(id) {
      store.update((state) => { state.activeImageId = id; }, 'image:active');
    },
    toggleSelected(id, checked) {
      store.update((state) => {
        if (checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
      }, 'selection:toggle');
    },
    selectAll(ids, checked) {
      store.update((state) => {
        if (checked) ids.forEach((id) => state.selectedIds.add(id));
        else state.selectedIds.clear();
      }, 'selection:all');
    },
    removeImages(ids) {
      const idSet = new Set(ids);
      store.update((state) => {
        state.images.filter((image) => idSet.has(image.id)).forEach((image) => URL.revokeObjectURL(image.objectUrl));
        state.images = state.images.filter((image) => !idSet.has(image.id));
        ids.forEach((id) => state.selectedIds.delete(id));
        if (!state.images.some((image) => image.id === state.activeImageId)) {
          state.activeImageId = state.images[0]?.id ?? null;
        }
        state.processing.pending = state.images.length;
      }, 'images:remove');
    },
    clearImages() {
      store.update((state) => {
        state.images.forEach((image) => URL.revokeObjectURL(image.objectUrl));
        state.images = [];
        state.selectedIds.clear();
        state.activeImageId = null;
        state.processing.pending = 0;
        state.processing.completed = 0;
        state.processing.failed = 0;
        state.processing.progress = 0;
        state.processing.bytes = 0;
      }, 'images:clear');
    },
    setQuery(query) { store.update((state) => { state.query = query; }, 'filter:query'); },
    setSort(sortBy) { store.update((state) => { state.sortBy = sortBy; }, 'filter:sort'); },
    setSettingsFilter(filter) { store.update((state) => { state.settingsFilter = filter; }, 'filter:settings-mode'); },
    setZoom(zoom) { store.update((state) => { state.zoom = Math.min(4, Math.max(0.1, zoom)); }, 'preview:zoom'); },
    setBackground(value) { store.update((state) => { state.previewBackground = value; }, 'preview:background'); },
    setPreviewMode(value) { store.update((state) => { state.previewMode = value; }, 'preview:mode'); },
    updateSetting(path, value) {
      store.update((state) => {
        const image = getImageById(state, state.activeImageId);
        const isCustom = image?.settingsMode === 'custom' && image.customSettings && !isTaskLevelSetting(path);
        const keys = path.split('.');
        const last = keys.pop();
        const settings = isCustom ? image.customSettings : state.settings;
        const target = keys.reduce((current, key) => current[key], settings);
        target[last] = value;
        if (isCustom) image.renderDirty = true;
        else state.images.filter((item) => item.settingsMode !== 'custom').forEach((item) => { item.renderDirty = true; });
        state.taskDirty = true;
        state.previewMode = 'processed';
        if (!isCustom) state.preset.modified = Boolean(state.preset.id);
      }, `settings:${path}`);
    },
    resetSettings() {
      store.update((state) => {
        const image = getImageById(state, state.activeImageId);
        if (image?.settingsMode === 'custom' && image.customSettings) {
          image.customSettings = createDefaultSettings();
          image.renderDirty = true;
        } else {
          state.settings = createDefaultSettings();
          state.images.filter((item) => item.settingsMode !== 'custom').forEach((item) => { item.renderDirty = true; });
          state.preset = { id: null, name: '未命名任务', modified: false };
        }
        state.previewMode = 'processed';
        state.zoom = 1;
      }, 'settings:reset');
    },
    applyPreset(preset) {
      store.update((state) => {
        state.settings = structuredClone(preset.settings);
        state.images.filter((image) => image.settingsMode !== 'custom').forEach((image) => { image.renderDirty = true; });
        state.preset = { id: preset.id, name: preset.name, modified: false };
        state.taskDirty = true;
        state.previewMode = 'processed';
        state.zoom = 1;
      }, 'preset:apply');
    },
    setPresetIdentity(id, name) {
      store.update((state) => {
        state.preset = { id, name, modified: false };
        state.taskDirty = true;
      }, 'preset:identity');
    },
    newTask() {
      store.getState().images.forEach((image) => URL.revokeObjectURL(image.objectUrl));
      store.reset();
    },
    enableCustomSettings(id = store.getState().activeImageId) {
      store.update((state) => {
        const image = getImageById(state, id);
        if (!image || image.settingsMode === 'custom') return;
        image.customSettings = structuredClone(state.settings);
        image.settingsMode = 'custom';
        image.renderDirty = true;
        state.taskDirty = true;
      }, 'image-settings:enable-custom');
    },
    restoreGlobalSettings(id = store.getState().activeImageId) {
      store.update((state) => {
        const image = getImageById(state, id);
        if (!image || image.settingsMode !== 'custom') return;
        image.settingsMode = 'global';
        image.customSettings = null;
        image.renderDirty = true;
        state.taskDirty = true;
      }, 'image-settings:restore-global');
    },
    panCrop(deltaX, deltaY) {
      store.update((state) => {
        const settings = getEffectiveSettings(state);
        settings.crop.x = Math.min(1, Math.max(0, settings.crop.x + deltaX));
        settings.crop.y = Math.min(1, Math.max(0, settings.crop.y + deltaY));
        const image = getImageById(state, state.activeImageId); if (image) image.renderDirty = true;
      }, 'crop:pan');
    },
    setCropZoom(value) {
      store.update((state) => {
        getEffectiveSettings(state).crop.zoom = Math.min(5, Math.max(1, value));
        const image = getImageById(state, state.activeImageId); if (image) image.renderDirty = true;
        state.previewMode = 'processed';
      }, 'crop:zoom');
    },
    resetCropPosition() {
      store.update((state) => {
        const settings = getEffectiveSettings(state);
        settings.crop.x = 0.5;
        settings.crop.y = 0.5;
        settings.crop.zoom = 1;
        const image = getImageById(state, state.activeImageId); if (image) image.renderDirty = true;
      }, 'crop:reset');
    },
    commitAiMaskStroke(mode, size, points) {
      store.update((state) => {
        const image = getImageById(state, state.activeImageId);
        if (!image || !['add', 'erase'].includes(mode) || !points?.length) return;
        image.aiMaskEdits ||= { strokes: [] };
        image.aiMaskEdits.strokes.push({ mode, size: Math.max(1, Number(size) || 1), points: points.slice(0, 4000).map((point) => [point.x, point.y]) });
        if (image.aiMaskEdits.strokes.length > 200) image.aiMaskEdits.strokes.shift();
        image.renderDirty = true;
        state.taskDirty = true;
      }, 'ai-edit:stroke');
    },
    clearAiMaskEdits() {
      store.update((state) => {
        const image = getImageById(state, state.activeImageId);
        if (!image) return;
        image.aiMaskEdits = { strokes: [] };
        image.renderDirty = true;
        state.taskDirty = true;
      }, 'ai-edit:clear');
    },
    resetAiMaskAdjustments() {
      store.update((state) => {
        const image = getImageById(state, state.activeImageId);
        const settings = getEffectiveSettings(state);
        Object.assign(settings.ai, { threshold: 0.5, softness: 0.12, feather: 2, edgeShift: 0, brushSize: 36 });
        if (image) {
          image.aiMaskEdits = { strokes: [] };
          image.renderDirty = true;
        }
        state.taskDirty = true;
        state.previewMode = 'processed';
      }, 'ai-edit:reset');
    },
    resetColorSettings() {
      store.update((state) => {
        const image = getImageById(state, state.activeImageId);
        const settings = getEffectiveSettings(state);
        const wasEnabled = settings.color.enabled;
        settings.color = createDefaultSettings().color;
        settings.color.enabled = wasEnabled;
        if (image?.settingsMode === 'custom') image.renderDirty = true;
        else state.images.filter((item) => item.settingsMode !== 'custom').forEach((item) => { item.renderDirty = true; });
        state.taskDirty = true;
        state.previewMode = 'processed';
        if (image?.settingsMode !== 'custom') state.preset.modified = Boolean(state.preset.id);
      }, 'settings:color-reset');
    },
    updateProcessing(patch, action = 'processing:update') {
      store.update((state) => {
        Object.assign(state.processing, patch);
      }, action);
    },
    appendLog(message, level = 'info') {
      store.update((state) => {
        state.processing.logs.push({ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), level, message });
      }, 'processing:log');
    }
  };
}
