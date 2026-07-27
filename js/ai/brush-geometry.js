export function mapCanvasPointToSource(canvasX, canvasY, drawRect, sourceRect, imageWidth, imageHeight) {
  if (!validRect(drawRect) || !validRect(sourceRect)) return null;
  if (canvasX < drawRect[0] || canvasY < drawRect[1] || canvasX > drawRect[0] + drawRect[2] || canvasY > drawRect[1] + drawRect[3]) return null;
  const sourceX = sourceRect[0] + ((canvasX - drawRect[0]) / Math.max(1e-6, drawRect[2])) * sourceRect[2];
  const sourceY = sourceRect[1] + ((canvasY - drawRect[1]) / Math.max(1e-6, drawRect[3])) * sourceRect[3];
  return {
    x: clamp01(sourceX / Math.max(1, imageWidth)),
    y: clamp01(sourceY / Math.max(1, imageHeight)),
    canvasX,
    canvasY
  };
}

export function toUnscaledLocalPoint(clientX, clientY, transformedRect, zoom) {
  const safeZoom = Math.max(0.01, Number(zoom) || 1);
  return { x: (clientX - transformedRect.left) / safeZoom, y: (clientY - transformedRect.top) / safeZoom };
}

function validRect(rect) {
  return Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
