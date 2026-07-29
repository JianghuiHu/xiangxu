import assert from 'node:assert/strict';
import { applyToneCurve, createCurveSvgPath, processColorPixels } from '../js/render/color-engine.js';

const defaults = {
  enabled: true,
  mode: 'none',
  source: '#ffffff',
  target: '#000000',
  tolerance: 24,
  exposure: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  tint: 0,
  hue: 0,
  opacity: 100,
  curves: {
    rgb: { shadows: 0, midtones: 0, highlights: 0 },
    r: { shadows: 0, midtones: 0, highlights: 0 },
    g: { shadows: 0, midtones: 0, highlights: 0 },
    b: { shadows: 0, midtones: 0, highlights: 0 }
  }
};

const adjusted = new Uint8ClampedArray([200, 100, 50, 255]);
processColorPixels(adjusted, { ...structuredClone(defaults), brightness: 50 });
assert.deepEqual([...adjusted], [100, 50, 25, 255], '基础调整模式必须真正改变像素');

const fullyTransparent = new Uint8ClampedArray([20, 40, 60, 255]);
processColorPixels(fullyTransparent, { ...structuredClone(defaults), opacity: 0 });
assert.equal(fullyTransparent[3], 0, '透明度 0 不能被默认值覆盖');

const replaced = new Uint8ClampedArray([250, 248, 252, 255]);
processColorPixels(replaced, { ...structuredClone(defaults), mode: 'replace', source: '#ffffff', target: '#ff0000', tolerance: 10, brightness: 0, opacity: 0, curves: { ...defaults.curves, r: { shadows: 0, midtones: 0, highlights: -100 } } });
assert.deepEqual([...replaced], [255, 0, 0, 255]);

const removed = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
processColorPixels(removed, { ...structuredClone(defaults), mode: 'colorToTransparent', source: '#ffffff', tolerance: 0, opacity: 0 });
assert.equal(removed[3], 0);
assert.equal(removed[7], 255, '转透明模式不能叠加基础透明度');

const grayscale = new Uint8ClampedArray([200, 100, 20, 255]);
processColorPixels(grayscale, { ...structuredClone(defaults), mode: 'grayscale', brightness: 0, temperature: 100 });
assert.equal(grayscale[0], grayscale[1]);
assert.equal(grayscale[1], grayscale[2]);
assert.notEqual(grayscale[0], 0, '灰度模式不能叠加基础亮度和色温');

const warm = new Uint8ClampedArray([128, 128, 128, 255]);
processColorPixels(warm, { ...structuredClone(defaults), temperature: 100 });
assert.ok(warm[0] > warm[2], '正色温应增加红色并减少蓝色');

assert.ok(applyToneCurve(45, { shadows: 80 }) > 45, '抬升暗部曲线应增亮暗部');
assert.ok(applyToneCurve(220, { highlights: -80 }) < 220, '压低高光曲线应降低高光');
assert.equal(createCurveSvgPath({}).split(' ').length, 51);

console.log('color engine pixel, zero-value and RGB curve tests passed');
