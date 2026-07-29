const REQUIRED_MODEL_FIELDS = ['id', 'name', 'category', 'summary', 'license', 'scenarios', 'runtime', 'compatibility', 'adaptation', 'links'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateExternalModelCatalog(catalog) {
  assert(catalog && typeof catalog === 'object', '外部模型配置必须是对象');
  assert(catalog.schemaVersion === 1, '不支持此外部模型配置版本');
  assert(catalog.cachePolicy === 'none', '外部模型配置不得启用像序缓存');
  assert(Array.isArray(catalog.models) && catalog.models.length > 0, '外部模型列表为空');
  const ids = new Set();
  catalog.models.forEach((model, index) => {
    REQUIRED_MODEL_FIELDS.forEach((field) => assert(model[field] != null, `第 ${index + 1} 个模型缺少 ${field}`));
    assert(!ids.has(model.id), `外部模型 ID 重复：${model.id}`);
    ids.add(model.id);
    assert(model.license.name && model.license.note && model.license.url, `${model.name} 缺少许可证信息`);
    assert(Array.isArray(model.scenarios) && model.scenarios.length > 0, `${model.name} 缺少适用场景`);
    assert(model.compatibility.status && model.compatibility.label && model.compatibility.detail, `${model.name} 缺少兼容状态`);
    assert(model.adaptation.title && Array.isArray(model.adaptation.steps) && model.adaptation.steps.length >= 3 && model.adaptation.result, `${model.name} 缺少完整适配路径`);
    assert(Array.isArray(model.links) && model.links.length > 0, `${model.name} 缺少外部链接`);
    model.links.forEach((link) => {
      assert(/^https:\/\//.test(link.url), `${model.name} 包含非 HTTPS 链接`);
      assert(link.newWindow === true && link.thirdParty === true, `${model.name} 的链接必须使用第三方新窗口提示`);
      if (link.url.includes('gitcode.com')) {
        assert(link.official === false, 'GitCode 链接不得标记为官方仓库');
        assert(link.sourceLabel.includes('国内源码镜像'), 'GitCode 链接必须标记为国内源码镜像');
      }
    });
  });
  const ppMatting = catalog.models.find((model) => model.id === 'ppmattingv2-external');
  assert(ppMatting?.category === '人像模型', 'PP-MattingV2 必须标记为人像模型');
  assert(ppMatting.compatibility.status === 'unsupported', 'PP-MattingV2 官方推理包必须标记为不能直接导入');
  return catalog;
}

export async function loadExternalModelCatalog(url = './models/external-models.json', fetchImpl = fetch) {
  const response = await fetchImpl(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`配置请求失败（HTTP ${response.status}）`);
  return validateExternalModelCatalog(await response.json());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

export function renderExternalModelCards(models) {
  return models.map((model) => {
    const compatibilityClass = model.compatibility.status === 'unsupported' ? 'is-unsupported' : 'is-adaptation';
    const scenarios = model.scenarios.map((scenario) => `<li>${escapeHtml(scenario)}</li>`).join('');
    const adaptationSteps = model.adaptation.steps.map((step, index) => `<li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join('');
    const links = model.links.map((link) => `<a class="external-model-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-external-url="${escapeHtml(link.url)}" data-external-label="${escapeHtml(link.label)}" data-external-source="${escapeHtml(link.sourceLabel)}"><span>${escapeHtml(link.label)}</span><small>${escapeHtml(link.sourceLabel)}</small></a>`).join('');
    return `<article class="external-model-card" data-external-model-id="${escapeHtml(model.id)}"><header><div><span class="external-model-category">${escapeHtml(model.category)}</span><h3>${escapeHtml(model.name)}</h3><small>${escapeHtml(model.ecosystem)}</small></div><span class="compatibility-badge ${compatibilityClass}">${escapeHtml(model.compatibility.label)}</span></header><p>${escapeHtml(model.summary)}</p><dl><div><dt>许可证</dt><dd>${escapeHtml(model.license.name)}<small>${escapeHtml(model.license.note)}</small></dd></div><div><dt>运行环境</dt><dd>${escapeHtml(model.runtime)}</dd></div><div><dt>适用场景</dt><dd><ul>${scenarios}</ul></dd></div><div><dt>兼容说明</dt><dd>${escapeHtml(model.compatibility.detail)}</dd></div></dl><details class="model-adaptation"><summary>查看接入像序的适配方案</summary><div><strong>${escapeHtml(model.adaptation.title)}</strong><ol>${adaptationSteps}</ol><p>${escapeHtml(model.adaptation.result)}</p></div></details><div class="external-model-links">${links}</div></article>`;
  }).join('');
}
