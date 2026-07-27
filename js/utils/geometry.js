export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function alignmentFactors(alignment = 'center') {
  const horizontal = alignment.includes('left') ? 0 : alignment.includes('right') ? 1 : 0.5;
  const vertical = alignment.includes('top') ? 0 : alignment.includes('bottom') ? 1 : 0.5;
  return { horizontal, vertical };
}

export function fitRect(sourceWidth, sourceHeight, box, mode, alignment, offsetX = 0, offsetY = 0) {
  const { horizontal, vertical } = alignmentFactors(alignment);
  let width = box.width;
  let height = box.height;
  if (mode !== 'stretch') {
    const scale = mode === 'cover'
      ? Math.max(box.width / sourceWidth, box.height / sourceHeight)
      : Math.min(box.width / sourceWidth, box.height / sourceHeight);
    width = sourceWidth * scale;
    height = sourceHeight * scale;
  }
  return {
    x: box.x + ((box.width - width) * horizontal) + offsetX,
    y: box.y + ((box.height - height) * vertical) + offsetY,
    width,
    height
  };
}

export function alignRect(outer, width, height, alignment) {
  const { horizontal, vertical } = alignmentFactors(alignment);
  return {
    x: outer.x + ((outer.width - width) * horizontal),
    y: outer.y + ((outer.height - height) * vertical),
    width,
    height
  };
}
