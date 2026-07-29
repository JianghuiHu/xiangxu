import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateExternalModelCatalog, loadExternalModelCatalog, renderExternalModelCards } from '../js/ai/external-models.js';

const catalog = JSON.parse(await readFile(new URL('../models/external-models.json', import.meta.url), 'utf8'));
validateExternalModelCatalog(catalog);

assert.equal(catalog.cachePolicy, 'none');
assert.equal(catalog.models.length, 3);
for (const model of catalog.models) {
  assert.ok(model.license.name);
  assert.ok(model.scenarios.length);
  assert.ok(model.runtime);
  assert.ok(model.compatibility.status);
  assert.ok(model.adaptation.steps.length >= 3);
  assert.ok(model.adaptation.result);
  assert.ok(model.links.every((link) => link.newWindow && link.thirdParty));
  assert.equal('installUrl' in model, false);
}

const ppMatting = catalog.models.find((model) => model.id === 'ppmattingv2-external');
assert.equal(ppMatting.name, 'PP-MattingV2');
assert.equal(ppMatting.category, '人像模型');
assert.match(ppMatting.ecosystem, /PaddleSeg.*开发套件/);
assert.match(ppMatting.compatibility.label, /不能直接导入像序网页版/);
assert.ok(ppMatting.links.some((link) => link.kind === 'download'));

const gitCodeLink = ppMatting.links.find((link) => link.url.includes('gitcode.com'));
assert.equal(gitCodeLink.official, false);
assert.match(gitCodeLink.sourceLabel, /国内源码镜像.*非官方仓库/);

const html = renderExternalModelCards(catalog.models);
assert.match(html, /target="_blank"/);
assert.match(html, /rel="noopener noreferrer"/);
assert.match(html, /data-external-source=/);
assert.match(html, /查看接入像序的适配方案/);
assert.match(html, /model-adaptation/);
assert.match(html, /不能直接导入像序网页版/);
assert.doesNotMatch(html, /下载并安装|导入模型/);

await assert.rejects(
  loadExternalModelCatalog('/missing.json', async () => ({ ok: false, status: 404 })),
  /HTTP 404/
);
await assert.rejects(
  loadExternalModelCatalog('/invalid.json', async () => ({ ok: true, json: async () => ({ ...catalog, cachePolicy: 'indexeddb' }) })),
  /不得启用像序缓存/
);

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
assert.match(indexHtml, /id="open-external-models"/);
assert.match(indexHtml, /id="external-model-options"/);
assert.match(indexHtml, /即将访问第三方网站/);
assert.match(indexHtml, /不会下载到像序缓存/);
assert.match(appSource, /window\.open\(target\.url, '_blank', 'noopener,noreferrer'\)/);
assert.match(appSource, /option\.value = `external:\$\{model\.id\}`/);
assert.match(appSource, /查看下载与适配方案/);
assert.match(appSource, /event\.preventDefault\(\);\s*requestExternalLink\(link\)/);

console.log('external model catalog tests passed');
