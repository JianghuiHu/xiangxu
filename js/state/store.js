import { createInitialState } from './defaults.js?v=7';

export function createStore() {
  let state = createInitialState();
  const listeners = new Set();
  const past = [];
  const future = [];

  const snapshot = () => ({
    settings: structuredClone(state.settings),
    imageSettings: state.images.map((image) => ({ id: image.id, settingsMode: image.settingsMode || 'global', customSettings: structuredClone(image.customSettings), aiMaskEdits: structuredClone(image.aiMaskEdits || { strokes: [] }), renderDirty: image.renderDirty !== false })),
    preset: structuredClone(state.preset), previewMode: state.previewMode, zoom: state.zoom, taskDirty: state.taskDirty
  });
  const restore = (entry) => {
    state.settings = entry.settings;
    const imageSettings = new Map((entry.imageSettings || []).map((item) => [item.id, item]));
    state.images.forEach((image) => {
      const saved = imageSettings.get(image.id);
      if (!saved) return;
      image.settingsMode = saved.settingsMode;
      image.customSettings = structuredClone(saved.customSettings);
      image.aiMaskEdits = structuredClone(saved.aiMaskEdits || { strokes: [] });
      image.renderDirty = saved.renderDirty;
    });
    state.preset = entry.preset; state.previewMode = entry.previewMode; state.zoom = entry.zoom; state.taskDirty = entry.taskDirty;
  };
  const isHistorical = (action) => /^(settings:|crop:|preset:|image-settings:|ai-edit:(stroke|clear|reset))/.test(action);

  const notify = (action = 'update') => {
    listeners.forEach((listener) => listener(state, action));
  };

  return {
    getState: () => state,
    update(mutator, action) {
      if (isHistorical(action)) { past.push(snapshot()); if (past.length > 40) past.shift(); future.length = 0; }
      const next = mutator(state);
      if (next) state = next;
      notify(action);
    },
    reset() {
      state = createInitialState();
      past.length = 0;
      future.length = 0;
      notify('reset');
    },
    undo() {
      const entry = past.pop();
      if (!entry) return;
      future.push(snapshot()); restore(entry); notify('history:undo');
    },
    redo() {
      const entry = future.pop();
      if (!entry) return;
      past.push(snapshot()); restore(entry); notify('history:redo');
    },
    historyState: () => ({ canUndo: past.length > 0, canRedo: future.length > 0 }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
