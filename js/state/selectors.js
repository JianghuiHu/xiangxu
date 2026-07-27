export function getImageById(state, imageId) {
  return state.images.find((image) => image.id === imageId) || null;
}

export function getEffectiveSettings(state, imageId = state.activeImageId) {
  const image = getImageById(state, imageId);
  if (image?.settingsMode === 'custom' && image.customSettings) return image.customSettings;
  return state.settings;
}

export function getCustomImageCount(state) {
  return state.images.reduce((count, image) => count + Number(image.settingsMode === 'custom' && Boolean(image.customSettings)), 0);
}

export function getSettingsScope(state, imageId = state.activeImageId) {
  const image = getImageById(state, imageId);
  return image?.settingsMode === 'custom' && image.customSettings ? 'custom' : 'global';
}
