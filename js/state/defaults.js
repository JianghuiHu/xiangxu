export const SUPPORTED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/svg+xml', 'image/gif'
]);

export const initialState = Object.freeze({
  images: [],
  activeImageId: null,
  selectedIds: new Set(),
  query: '',
  sortBy: 'importOrder',
  settingsFilter: 'all',
  zoom: 1,
  previewMode: 'processed',
  previewBackground: 'checker',
  dragDepth: 0,
  importOrder: 0,
  taskDirty: false,
  preset: { id: null, name: '未命名任务', modified: false },
  processing: { pending: 0, completed: 0, failed: 0, warning: 0, running: false, paused: false, progress: 0, bytes: 0, logs: [] },
  settings: {
    ai: { enabled: false, modelId: 'ppmattingv2', threshold: 0.5, softness: 0.12, feather: 2, edgeShift: 0, brushSize: 36 },
    trim: { enabled: false, mode: 'transparent', alphaThreshold: 8, color: '#ffffff', tolerance: 20, padding: 0 },
    resize: { enabled: false, width: 1024, height: 1024, mode: 'contain', quality: 'high' },
    crop: { enabled: false, mode: 'free', x: 0.5, y: 0.5, zoom: 1, freeWidth: 100, freeHeight: 100, customRatioWidth: 5, customRatioHeight: 4, guides: 'thirds' },
    mask: { enabled: false, type: 'rectangle', radius: 32 },
    canvas: { enabled: false, width: 1024, height: 1024, background: { type: 'transparent', color: '#ffffff' } },
    position: { margin: 0, alignment: 'center', offsetX: 0, offsetY: 0 },
    subject: { enabled: false, widthPercent: 80, heightPercent: 72, alignment: 'center' },
    color: { enabled: false, mode: 'none', source: '#ffffff', target: '#000000', tolerance: 24, brightness: 100, contrast: 100, saturation: 100, opacity: 100 },
    watermark: { enabled: false, type: 'text', text: '© 像序', fontSize: 32, weight: 600, color: '#ffffff', opacity: 65, rotation: 0, alignment: 'bottom-right', margin: 24, tiled: false, imageDataUrl: '', imageName: '', imageScale: 20 },
    compression: { targetEnabled: false, targetKB: 200, minQuality: 20, allowResize: false },
    inspection: { maxKB: 2048, minWidth: 256, minHeight: 256 },
    sprite: { cellWidth: 64, cellHeight: 64, gap: 4, columns: 8, autoColumns: true, powerOfTwo: false, backgroundType: 'transparent', background: '#00000000', sort: 'importOrder', filename: 'sprite' },
    output: { format: 'png', quality: 90, mode: 'zip', jpegBackground: '#ffffff', filenameTemplate: '{原文件名}_{宽度}x{高度}', sequenceStart: 1, sequenceDigits: 3 }
  }
});

export function createInitialState() {
  return {
    ...initialState,
    images: [],
    selectedIds: new Set(),
    processing: { ...initialState.processing, logs: [] },
    preset: { ...initialState.preset },
    settings: structuredClone(initialState.settings)
  };
}

export function createDefaultSettings() {
  return structuredClone(initialState.settings);
}
