import { createDefaultSettings } from '../state/defaults.js';

const DB_NAME = 'ImageBatchStudio';
const STORE_NAME = 'presets';
const FALLBACK_KEY = 'imageBatchStudio.presets.v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

function fallbackRead() {
  try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]'); } catch { return []; }
}

function fallbackWrite(records) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
}

function mergeKnown(defaults, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(defaults);
  const result = structuredClone(defaults);
  Object.keys(defaults).forEach((key) => {
    if (!(key in value)) return;
    if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) result[key] = mergeKnown(defaults[key], value[key]);
    else if (typeof value[key] === typeof defaults[key]) result[key] = value[key];
  });
  return result;
}

export function normalizePreset(input, { keepId = false } = {}) {
  if (!input || typeof input !== 'object') throw new Error('预设必须是 JSON 对象');
  const name = String(input.name || '').trim().slice(0, 60);
  if (!name) throw new Error('预设名称不能为空');
  const inputSettings = input.globalSettings || input.settings;
  if (!inputSettings || typeof inputSettings !== 'object') throw new Error(`“${name}”缺少 globalSettings`);
  const now = Date.now();
  const settings = mergeKnown(createDefaultSettings(), inputSettings);
  if (!['ppmattingv2', 'u2netp'].includes(settings.ai.modelId) && !/^external:[a-z0-9-]+$/.test(settings.ai.modelId)) settings.ai.modelId = 'ppmattingv2';
  if (settings.color.mode === 'whiteToTransparent') settings.color.mode = 'colorToTransparent';
  return {
    id: keepId && /^user:/.test(input.id || '') ? input.id : `user:${crypto.randomUUID()}`,
    name,
    description: String(input.description || '').trim().slice(0, 160),
    settings,
    system: false,
    favorite: Boolean(input.favorite),
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now,
    lastUsedAt: Number(input.lastUsedAt) || 0
  };
}

export async function listUserPresets() {
  let records;
  try { records = await withStore('readonly', (store) => store.getAll()); }
  catch { records = fallbackRead(); }
  return records.map((record) => normalizePreset(record, { keepId: true })).sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastUsedAt || b.updatedAt) - (a.lastUsedAt || a.updatedAt));
}

export async function saveUserPreset(input) {
  const preset = normalizePreset({ ...input, updatedAt: Date.now() }, { keepId: true });
  try { await withStore('readwrite', (store) => store.put(preset)); }
  catch {
    const records = fallbackRead().filter((item) => item.id !== preset.id);
    records.push(preset); fallbackWrite(records);
  }
  return preset;
}

export async function deleteUserPreset(id) {
  try { await withStore('readwrite', (store) => store.delete(id)); }
  catch { fallbackWrite(fallbackRead().filter((item) => item.id !== id)); }
}

export async function updateUserPreset(id, patch) {
  const records = await listUserPresets();
  const current = records.find((item) => item.id === id);
  if (!current) throw new Error('预设不存在或已删除');
  return saveUserPreset({ ...current, ...patch, id, createdAt: current.createdAt });
}

export function serializePreset(preset) {
  return JSON.stringify({ schema: 'xiangxu/preset', version: 2, preset: { name: preset.name, description: preset.description || '', globalSettings: preset.settings } }, null, 2);
}

export function parsePresetJson(text) {
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('JSON 格式无效'); }
  const inputs = Array.isArray(payload) ? payload : payload.presets || [payload.preset || payload];
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('JSON 中没有预设');
  return inputs.map((item) => normalizePreset(item));
}
