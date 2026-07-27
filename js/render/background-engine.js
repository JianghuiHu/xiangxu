export function renderBackground(context, width, height, background) {
  context.clearRect(0, 0, width, height);
  if (background?.type !== 'solid') return;
  context.save();
  context.fillStyle = background.color || '#ffffff';
  context.fillRect(0, 0, width, height);
  context.restore();
}
