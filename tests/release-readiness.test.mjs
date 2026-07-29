import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readText = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const [gitignore, indexHtml, modelManager, manifestText, readme, privacy] = await Promise.all([
  readText('.gitignore'),
  readText('index.html'),
  readText('js/ai/model-manager.js'),
  readText('models/model-manifest.json'),
  readText('README.md'),
  readText('docs/privacy.md')
]);

const manifest = JSON.parse(manifestText);
const modelIds = manifest.models.map(({ id }) => id);

assert.match(gitignore, /^dist\/$/m, '发布成品目录必须被忽略');
assert.match(gitignore, /^backup_legacy\/$/m, '旧备份必须被忽略');
assert.match(gitignore, /^assets\/models\/\*\.onnx$/m, '本地 ONNX 权重必须被忽略');
assert.match(gitignore, /^\.vercel\/$/m, 'Vercel 本地元数据必须被忽略');
assert.deepEqual(modelIds, ['ppmattingv2', 'u2netp']);
assert.equal(manifest.models.every(({ distributedWithSource }) => distributedWithSource === true), true);
assert.match(modelManager, /method:\s*'HEAD'/, '必须检测本地模型是否真实存在');
assert.match(modelManager, /fetch\(catalog\.url,\s*\{\s*cache:\s*'no-store',\s*signal\s*\}\)/, '模型下载必须支持 AbortSignal');
assert.match(modelManager, /reader\.cancel\(\)/, '取消或失败后必须关闭下载流');
assert.match(indexHtml, /id="ai-cancel-model-download"/, '模型区必须提供取消下载按钮');
assert.match(indexHtml, /PP-MattingV2 与 u2netp 均为内置离线模型/, '网页必须如实说明两个内置模型无需下载');
assert.match(readme, /License[\s\S]*待确定/, '用户未确认许可证前 README 必须标记待确定');
assert.match(privacy, /不会发送到像序服务器/, '隐私文档必须说明图片处理边界');

console.log('release readiness and bundled-model tests passed');
