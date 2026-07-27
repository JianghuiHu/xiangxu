import { createDefaultSettings } from '../state/defaults.js';

function make(id, name, description, patch) {
  const settings = createDefaultSettings();
  Object.entries(patch).forEach(([section, value]) => Object.assign(settings[section], value));
  return { id: `system:${id}`, name, description, settings, system: true, favorite: false, createdAt: 0, updatedAt: 0, lastUsedAt: 0 };
}

export const SYSTEM_PRESETS = Object.freeze([
  make('transparent-icon-512', '透明图标 · 512', '512×512 PNG，透明画布，适合图标资产。', {
    trim: { enabled: true, mode: 'transparent' }, subject: { enabled: true, widthPercent: 80, heightPercent: 72 },
    resize: { enabled: true, width: 512, height: 512, mode: 'contain' },
    canvas: { enabled: true, width: 512, height: 512 },
    output: { format: 'png', filenameTemplate: '{原文件名}_icon_{宽度}x{高度}' }
  }),
  make('ui-webp-256', 'UI 素材 · WebP 256', '256×256 WebP，兼顾网页体积和透明度。', {
    trim: { enabled: true, mode: 'transparent' }, subject: { enabled: true, widthPercent: 80, heightPercent: 80 },
    resize: { enabled: true, width: 256, height: 256, mode: 'contain' },
    canvas: { enabled: true, width: 256, height: 256 },
    output: { format: 'webp', quality: 85, filenameTemplate: '{原文件名}_ui_{序号}' }
  }),
  make('portfolio-cover', '作品集封面 · 1920×1080', '16:9 Cover 裁切，JPEG 90。', {
    crop: { enabled: true, mode: '16:9' },
    resize: { enabled: true, width: 1920, height: 1080, mode: 'cover' },
    canvas: { enabled: true, width: 1920, height: 1080, background: { type: 'solid', color: '#ffffff' } },
    output: { format: 'jpeg', quality: 90, filenameTemplate: '{原文件名}_cover' }
  }),
  make('device-white-1024', '设备图 · 白底 1024', '1024×1024 白底 PNG，保留 48px 安全边距。', {
    trim: { enabled: true, mode: 'white', tolerance: 20 }, subject: { enabled: true, widthPercent: 90, heightPercent: 75, alignment: 'bottom' },
    resize: { enabled: true, width: 1024, height: 1024, mode: 'contain' },
    canvas: { enabled: true, width: 1024, height: 1024, background: { type: 'solid', color: '#ffffff' } },
    position: { margin: 48 }, output: { format: 'png' }
  }),
  make('web-light', '网页轻量图', '1600×1200 WebP 80，适合常规网页图片。', {
    resize: { enabled: true, width: 1920, height: 1920, mode: 'contain' }, compression: { targetEnabled: true, targetKB: 300, minQuality: 20, allowResize: true },
    output: { format: 'webp', quality: 80, filenameTemplate: '{原文件名}_web' }
  }),
  make('circle-avatar-800', '圆形头像 · 800', '800×800 圆形透明 PNG。', {
    resize: { enabled: true, width: 800, height: 800, mode: 'cover' },
    crop: { enabled: true, mode: '1:1' }, mask: { enabled: true, type: 'circle' },
    canvas: { enabled: true, width: 800, height: 800 }, output: { format: 'png', filenameTemplate: '{原文件名}_avatar' }
  })
]);
