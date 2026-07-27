import assert from 'node:assert/strict';
import { mapCanvasPointToSource, toUnscaledLocalPoint } from '../js/ai/brush-geometry.js';

const zoom = 2;
const transformedRect = { left: 100, top: 80, width: 400, height: 400 };
const client = { x: 200, y: 280 };
const local = toUnscaledLocalPoint(client.x, client.y, transformedRect, zoom);
assert.deepEqual(local, { x: 50, y: 100 }, '缩放画布的光标坐标必须除以 zoom，避免二次放大偏移');

const canvasX = ((client.x - transformedRect.left) / transformedRect.width) * 200;
const canvasY = ((client.y - transformedRect.top) / transformedRect.height) * 200;
const mapped = mapCanvasPointToSource(canvasX, canvasY, [0, 0, 200, 200], [0, 0, 200, 200], 200, 200);
assert.deepEqual(mapped, { x: 0.25, y: 0.5, canvasX: 50, canvasY: 100 }, '200% 缩放下画笔应落在相同的原图归一化位置');

const cropped = mapCanvasPointToSource(50, 100, [20, 20, 160, 160], [40, 30, 80, 120], 200, 200);
assert.deepEqual(cropped, { x: 0.275, y: 0.45, canvasX: 50, canvasY: 100 }, '裁切和缩放后的画布坐标必须反算回原图');
assert.equal(mapCanvasPointToSource(5, 5, [20, 20, 160, 160], [40, 30, 80, 120], 200, 200), null, '画布内容外不得误画');

console.log('AI brush zoom and crop geometry tests passed');
