import assert from 'node:assert/strict';
import { createStore } from '../js/state/store.js';
import { createActions } from '../js/state/actions.js';
import { getEffectiveSettings } from '../js/state/selectors.js';
import { normalizePreset, serializePreset } from '../js/presets/preset-manager.js';

const store = createStore();
const actions = createActions(store);
const image = (id, name) => ({
  id,
  name,
  width: 100,
  height: 100,
  size: 100,
  objectUrl: `blob:${id}`,
  settingsMode: 'global',
  customSettings: null,
  renderDirty: true
});

actions.addImages([image('A', 'A.png'), image('B', 'B.png'), image('C', 'C.png')]);
assert.deepEqual(store.getState().images.map(({ settingsMode }) => settingsMode), ['global', 'global', 'global']);
assert.equal(store.getState().activeImageId, 'A', '首次批量导入必须默认预览第一张');

actions.setActive('B');
actions.commitAiMaskStroke('add', 24, [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }]);
assert.equal(store.getState().images.find(({ id }) => id === 'B').aiMaskEdits.strokes.length, 1, '画笔修补必须属于当前图片');
assert.equal(store.getState().images.find(({ id }) => id === 'A').aiMaskEdits, undefined, '画笔修补不得污染其他图片');
store.undo();
assert.equal(store.getState().images.find(({ id }) => id === 'B').aiMaskEdits.strokes.length, 0, '整笔画笔修补必须一次撤销');
store.redo();
assert.equal(store.getState().images.find(({ id }) => id === 'B').aiMaskEdits.strokes.length, 1, '画笔修补必须可重做');
actions.updateSetting('ai.feather', 9);
actions.updateSetting('ai.edgeShift', 7);
actions.resetAiMaskAdjustments();
assert.equal(getEffectiveSettings(store.getState(), 'B').ai.feather, 2, '一键还原必须恢复羽化默认值');
assert.equal(getEffectiveSettings(store.getState(), 'B').ai.edgeShift, 0, '一键还原必须恢复边缘扩缩');
assert.equal(store.getState().images.find(({ id }) => id === 'B').aiMaskEdits.strokes.length, 0, '一键还原必须清除当前图笔触');
store.undo();
assert.equal(getEffectiveSettings(store.getState(), 'B').ai.feather, 9, '一键还原必须可撤销');
assert.equal(store.getState().images.find(({ id }) => id === 'B').aiMaskEdits.strokes.length, 1, '撤销还原必须恢复笔触');

actions.setActive('B');
const globalBeforeCustom = structuredClone(store.getState().settings);
actions.enableCustomSettings();
assert.equal(store.getState().images[1].settingsMode, 'custom');
assert.deepEqual(getEffectiveSettings(store.getState(), 'B'), globalBeforeCustom, '切换为自定义时预览参数不得跳变');

actions.updateSetting('position.offsetX', 37);
assert.equal(getEffectiveSettings(store.getState(), 'B').position.offsetX, 37);
assert.equal(getEffectiveSettings(store.getState(), 'A').position.offsetX, 0);
assert.equal(getEffectiveSettings(store.getState(), 'C').position.offsetX, 0);

actions.setActive('A');
actions.updateSetting('canvas.enabled', true);
actions.updateSetting('canvas.background.type', 'solid');
actions.updateSetting('canvas.background.color', '#0000ff');
assert.equal(getEffectiveSettings(store.getState(), 'A').canvas.background.color, '#0000ff');
assert.equal(getEffectiveSettings(store.getState(), 'C').canvas.background.color, '#0000ff');
assert.equal(getEffectiveSettings(store.getState(), 'B').canvas.background.type, 'transparent');

actions.updateSetting('canvas.background.color', '#00ff00');
assert.equal(getEffectiveSettings(store.getState(), 'B').canvas.background.type, 'transparent');
actions.restoreGlobalSettings('B');
assert.equal(getEffectiveSettings(store.getState(), 'B').canvas.background.color, '#00ff00');
store.undo();
assert.equal(store.getState().images[1].settingsMode, 'custom', '恢复统一必须可撤销');
assert.equal(getEffectiveSettings(store.getState(), 'B').position.offsetX, 37);
store.redo();
assert.equal(store.getState().images[1].settingsMode, 'global', '恢复统一必须可重做');

store.undo();
const presetText = serializePreset({ name: '测试预设', description: '', settings: store.getState().settings });
const presetJson = JSON.parse(presetText);
assert.ok(presetJson.preset.globalSettings);
assert.equal('settings' in presetJson.preset, false);
assert.equal(presetText.includes('B.png'), false);
assert.equal(presetText.includes('"B"'), false);
assert.equal(presetText.includes('customSettings'), false);
assert.equal(presetText.includes('aiMaskEdits'), false, '预设不得携带单图画笔数据');

const legacySettings = structuredClone(store.getState().settings);
legacySettings.ai.modelId = 'u2netp';
const migratedPreset = normalizePreset({ name: '旧 AI 预设', globalSettings: legacySettings });
assert.equal(migratedPreset.settings.ai.modelId, 'u2netp', '已重新支持的 u2netp 预设应保留模型选择');

const beforeApplyB = structuredClone(getEffectiveSettings(store.getState(), 'B'));
actions.updateSetting('output.mode', 'zip');
assert.equal(store.getState().settings.output.mode, 'zip', '导出位置属于任务级设置');
assert.equal(getEffectiveSettings(store.getState(), 'B').output.mode, beforeApplyB.output.mode, '任务级设置不应写入单图参数');
const applied = structuredClone(store.getState().settings);
applied.position.offsetX = 91;
actions.applyPreset({ id: 'new-preset', name: '新预设', settings: applied });
assert.equal(getEffectiveSettings(store.getState(), 'A').position.offsetX, 91);
assert.equal(getEffectiveSettings(store.getState(), 'C').position.offsetX, 91);
assert.deepEqual(getEffectiveSettings(store.getState(), 'B'), beforeApplyB, '应用预设不得覆盖自定义图片');

actions.setActive('A');
actions.updateSetting('canvas.width', 512);
actions.updateSetting('canvas.height', 512);
actions.setActive('B');
actions.updateSetting('canvas.width', 800);
actions.updateSetting('canvas.height', 600);
assert.deepEqual([getEffectiveSettings(store.getState(), 'A').canvas.width, getEffectiveSettings(store.getState(), 'A').canvas.height], [512, 512]);
assert.deepEqual([getEffectiveSettings(store.getState(), 'B').canvas.width, getEffectiveSettings(store.getState(), 'B').canvas.height], [800, 600]);
assert.deepEqual([getEffectiveSettings(store.getState(), 'C').canvas.width, getEffectiveSettings(store.getState(), 'C').canvas.height], [512, 512]);

actions.updateSetting('color.enabled', true);
actions.updateSetting('color.brightness', 42);
actions.updateSetting('color.curves.r.highlights', -60);
actions.resetColorSettings();
assert.equal(getEffectiveSettings(store.getState(), 'B').color.enabled, true, '还原颜色参数不应关闭已经启用的颜色模块');
assert.equal(getEffectiveSettings(store.getState(), 'B').color.brightness, 100);
assert.equal(getEffectiveSettings(store.getState(), 'B').color.curves.r.highlights, 0);

const reimportStore = createStore();
const reimportActions = createActions(reimportStore);
reimportActions.addImages([image('first-a', 'first-a.png'), image('first-b', 'first-b.png')]);
reimportActions.setActive('first-b');
reimportActions.addImages([image('second-a', 'second-a.png'), image('second-b', 'second-b.png')]);
assert.equal(reimportStore.getState().activeImageId, 'second-a', '每次新增一组图片都必须预览本次导入的第一张');
assert.equal(reimportStore.getState().selectedIds.size, 0, '默认预览不得误勾选批量操作复选框');

console.log('single-image settings state/preset tests passed');
