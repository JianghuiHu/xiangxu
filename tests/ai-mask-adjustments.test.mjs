import assert from 'node:assert/strict';
import { adjustMask, blurMask, morphMask } from '../js/ai/mask-adjustments.js';

const index = (x, y, width) => (y * width) + x;

const point = new Float32Array(9 * 9);
point[index(4, 4, 9)] = 1;
const expanded = morphMask(point, 9, 9, 1);
assert.equal(expanded[index(3, 3, 9)], 1, '外扩必须覆盖对角邻域');
assert.equal(expanded[index(2, 4, 9)], 0, '外扩半径不得越界');

const block = new Float32Array(9 * 9);
for (let y = 2; y <= 6; y += 1) for (let x = 2; x <= 6; x += 1) block[index(x, y, 9)] = 1;
const contracted = morphMask(block, 9, 9, -1);
assert.equal(contracted[index(2, 4, 9)], 0, '内缩必须移除边缘');
assert.equal(contracted[index(4, 4, 9)], 1, '内缩必须保留足够厚的中心');
const full = new Float32Array(9 * 9).fill(1);
assert.equal(morphMask(full, 9, 9, -1)[index(0, 4, 9)], 0, '贴边主体内缩时必须把画布外视为背景');

const feathered = blurMask(point, 9, 9, 1, 2);
assert.ok(feathered[index(4, 4, 9)] > 0 && feathered[index(4, 4, 9)] < 1, '羽化中心应成为连续 Alpha');
assert.ok(feathered[index(3, 4, 9)] > 0, '羽化应向邻近像素产生过渡');

const empty = { width: 21, height: 21, data: new Float32Array(21 * 21) };
const added = adjustMask(empty, { edgeShift: 0, feather: 0 }, { strokes: [{ mode: 'add', size: 3, points: [[0.5, 0.5]] }] }, { width: 21, height: 21 });
assert.equal(added.data[index(10, 10, 21)], 1, '增加画笔必须把 Mask 写为前景');
const erased = adjustMask(added, { edgeShift: 0, feather: 0 }, { strokes: [{ mode: 'erase', size: 2, points: [[0.5, 0.5]] }] }, { width: 21, height: 21 });
assert.equal(erased.data[index(10, 10, 21)], 0, '减少画笔必须把 Mask 写为背景');
const quarter = adjustMask(empty, { edgeShift: 0, feather: 0 }, { strokes: [{ mode: 'add', size: 2, points: [[0.25, 0.5]] }] }, { width: 21, height: 21 });
assert.equal(quarter.data[index(5, 10, 21)], 1, '非中心画笔必须落在对应坐标');
assert.equal(quarter.data[index(10, 10, 21)], 0, '非中心画笔不得偏移到画布中心');

console.log('AI mask edge and brush adjustment tests passed');
