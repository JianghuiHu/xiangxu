export function createToast(region) {
  return function showToast(message, type = 'info', duration = 3200) {
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    region.append(element);
    window.setTimeout(() => element.remove(), duration);
  };
}
