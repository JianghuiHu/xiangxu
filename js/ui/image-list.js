import { formatBytes } from '../utils/format.js';

const MODE_ICONS = {
  global: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v4H4V5Zm0 6h16v8H4v-8Zm2 2v4h12v-4H6Z"/></svg>',
  custom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17v2h6v-2H3Zm0-7v2h12v-2H3Zm0-7v2h18V3H3Zm10 16v-2h8v2h-8Zm4-7v-2h4v2h-4ZM7 5V3h14v2H7Z"/></svg>'
};

function compareImages(sortBy) {
  return (a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
    if (sortBy === 'width') return b.width - a.width;
    if (sortBy === 'height') return b.height - a.height;
    if (sortBy === 'size') return b.size - a.size;
    if (sortBy === 'extension') return a.extension.localeCompare(b.extension);
    return a.importOrder - b.importOrder;
  };
}

export function getVisibleImages(state) {
  const query = state.query.trim().toLocaleLowerCase('zh-CN');
  return state.images.filter((image) => {
    if (query && !image.name.toLocaleLowerCase('zh-CN').includes(query)) return false;
    if (state.settingsFilter === 'custom') return image.settingsMode === 'custom';
    if (state.settingsFilter === 'global') return image.settingsMode !== 'custom';
    return true;
  }).sort(compareImages(state.sortBy));
}

export function renderImageList(container, emptyElement, state, handlers) {
  const images = getVisibleImages(state);
  container.replaceChildren();
  if (!images.length) {
    const empty = emptyElement.cloneNode(true);
    empty.id = 'empty-list';
    if (state.images.length) {
      empty.querySelector('strong').textContent = '没有匹配的图片';
      empty.querySelector('span').textContent = '请修改搜索条件';
    }
    container.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  images.forEach((image) => {
    const item = document.createElement('div');
    item.className = `image-item${image.id === state.activeImageId ? ' active' : ''}`;
    item.tabIndex = 0;
    item.role = 'listitem';
    item.dataset.id = image.id;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedIds.has(image.id);
    checkbox.ariaLabel = `选择 ${image.name}`;
    checkbox.addEventListener('change', (event) => handlers.onToggle(image.id, event.target.checked));
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    const thumbnail = document.createElement('img');
    thumbnail.className = 'thumbnail';
    thumbnail.src = image.objectUrl;
    thumbnail.alt = '';
    const meta = document.createElement('div');
    meta.className = 'image-meta';
    const alphaLabel = image.hasAlpha === true ? '<span class="alpha-tag">透明</span>' : '';
    const custom = image.settingsMode === 'custom';
    const mode = custom ? 'custom' : 'global';
    meta.innerHTML = `<strong class="image-name" title="${escapeHtml(image.name)}">${escapeHtml(image.name)}</strong><span class="settings-mode-tag ${mode}" title="${custom ? '当前图片使用独立处理参数' : '当前图片跟随统一处理参数'}">${MODE_ICONS[mode]}<span>${custom ? '自定义' : '统一'}</span></span><span class="image-details"><span>${image.width}×${image.height}</span><span>${formatBytes(image.size)}</span><span class="format-tag">${escapeHtml(image.extension.toUpperCase())}</span>${alphaLabel}</span>`;
    const remove = document.createElement('button');
    remove.className = 'remove-image';
    remove.type = 'button';
    remove.ariaLabel = `删除 ${image.name}`;
    remove.textContent = '×';
    remove.addEventListener('click', (event) => { event.stopPropagation(); handlers.onRemove(image.id); });
    item.append(checkbox, thumbnail, meta, remove);
    item.addEventListener('click', () => handlers.onActivate(image.id));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlers.onActivate(image.id); }
    });
    fragment.append(item);
  });
  container.append(fragment);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
