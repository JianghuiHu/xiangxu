export function bindSettingsPanel(container) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('.setting-title');
    if (!button) return;
    const card = button.closest('.setting-card');
    card.classList.toggle('expanded');
    button.querySelector('i').textContent = card.classList.contains('expanded') ? '⌃' : '⌄';
  });
}
