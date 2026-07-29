import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AI_MODEL_CATALOG, listInstalledModels } from '../js/ai/model-manager.js';

const expectedHash = '8286b1a110360e868d54ad00319aaa12d5e7bba79ee42e057d67fa5baa8962ff';
const model = await readFile(new URL('../assets/models/ppmattingv2-stdc1-human-512.onnx', import.meta.url));
const u2netpModel = await readFile(new URL('../assets/models/u2netp.onnx', import.meta.url));
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(model).digest('hex');

assert.equal(model.byteLength, 35940680, '内置 PP-MattingV2 文件大小必须保持不变');
assert.equal(checksum, expectedHash, '内置 PP-MattingV2 必须通过转换产物哈希校验');
assert.deepEqual(Object.keys(AI_MODEL_CATALOG), ['ppmattingv2', 'u2netp']);
assert.equal(AI_MODEL_CATALOG.ppmattingv2.size, model.byteLength);
assert.equal(AI_MODEL_CATALOG.ppmattingv2.checksum, checksum);
assert.deepEqual(AI_MODEL_CATALOG.ppmattingv2.inputShape, [1, 3, 512, 512]);
assert.match(AI_MODEL_CATALOG.ppmattingv2.builtinUrl, /assets\/models\/ppmattingv2-stdc1-human-512\.onnx$/);
assert.equal(u2netpModel.byteLength, 4574861, '内置 u2netp 文件大小必须保持不变');
assert.equal(createHash('sha256').update(u2netpModel).digest('hex'), AI_MODEL_CATALOG.u2netp.checksum, '内置 u2netp 必须通过哈希校验');
assert.match(AI_MODEL_CATALOG.u2netp.builtinUrl, /assets\/models\/u2netp\.onnx$/);
assert.match(indexHtml, /value="u2netp"/);
assert.doesNotMatch(indexHtml, /ai-import-model|ai-model-file|导入 ONNX/, '不应再显示专业模型导入入口');
assert.doesNotMatch(indexHtml, /ai-preview-button|生成当前图片抠图预览/, '自动实时预览后不应保留重复按钮');

const installed = await listInstalledModels();
for (const id of ['ppmattingv2', 'u2netp']) {
  const builtin = installed.find((modelMetadata) => modelMetadata.id === id);
  assert.equal(builtin?.builtin, true, `没有 IndexedDB 时仍必须识别内置 ${id}`);
  assert.equal(builtin?.source, 'bundled');
}

console.log('bundled PP-MattingV2 and u2netp integrity tests passed');
