import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultSettings } from '../js/state/defaults.js';

const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const exporterSource = await readFile(new URL('../js/export/exporter.js', import.meta.url), 'utf8');
const startProcessingSource = appSource.slice(
  appSource.indexOf('async function startProcessing()'),
  appSource.indexOf("$('#start-processing').addEventListener")
);

assert.equal(createDefaultSettings().output.mode, 'zip', '新任务必须默认使用安全 ZIP');
assert.equal(
  startProcessingSource.includes('chooseExportDirectory('),
  false,
  '主导出按钮不得自动唤起宿主文件夹选择器'
);
assert.equal(
  exporterSource.includes('.click()'),
  false,
  '导出模块不得通过隐藏链接强制触发宿主下载'
);
assert.match(exporterSource, /xiangxu:download-ready/, '网页导出必须提供显式保存入口');
assert.match(exporterSource, /has\('verified'\)/, '内置验证页必须识别为嵌入式宿主');
assert.match(appSource, /safeZipFallback/, '未授权文件夹模式必须安全回退 ZIP');

console.log('export safety regression tests passed');
