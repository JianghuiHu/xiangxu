export function adjustMask(baseMask, settings = {}, edits = null, sourceSize = {}) {
  const { width, height } = baseMask;
  let data = Float32Array.from(baseMask.data, clamp01);
  const sourceWidth = positive(sourceSize.width, width);
  const sourceHeight = positive(sourceSize.height, height);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const edgeShift = Math.round((Number(settings.edgeShift) || 0) * scale);
  if (edgeShift) data = morphMask(data, width, height, edgeShift);
  if (edits?.strokes?.length) applyBrushEdits(data, width, height, edits.strokes, sourceWidth, sourceHeight);
  const feather = Math.min(32, Math.round(Math.max(0, Number(settings.feather) || 0) * scale));
  if (feather) data = blurMask(data, width, height, feather, 2);
  return { width, height, data };
}

export function morphMask(input, width, height, signedRadius) {
  const radius = Math.min(32, Math.abs(Math.round(signedRadius)));
  if (!radius) return Float32Array.from(input);
  const isMax = signedRadius > 0;
  const horizontal = new Float32Array(input.length);
  const output = new Float32Array(input.length);
  slidingExtrema(input, horizontal, width, height, radius, true, isMax);
  slidingExtrema(horizontal, output, width, height, radius, false, isMax);
  if (!isMax) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x < radius || y < radius || x >= width - radius || y >= height - radius) output[(y * width) + x] = 0;
      }
    }
  }
  return output;
}

export function blurMask(input, width, height, radius, passes = 2) {
  let current = Float32Array.from(input);
  const safeRadius = Math.min(32, Math.max(1, Math.round(radius)));
  for (let pass = 0; pass < passes; pass += 1) {
    const horizontal = new Float32Array(current.length);
    const vertical = new Float32Array(current.length);
    movingAverage(current, horizontal, width, height, safeRadius, true);
    movingAverage(horizontal, vertical, width, height, safeRadius, false);
    current = vertical;
  }
  return current;
}

export function applyBrushEdits(data, width, height, strokes, sourceWidth, sourceHeight) {
  for (const stroke of strokes) {
    if (!stroke?.points?.length || !['add', 'erase'].includes(stroke.mode)) continue;
    const radiusX = Math.max(1, (Number(stroke.size) || 1) * width / positive(sourceWidth, width));
    const radiusY = Math.max(1, (Number(stroke.size) || 1) * height / positive(sourceHeight, height));
    let previous = null;
    for (const point of stroke.points) {
      const current = { x: clamp01(point[0]) * (width - 1), y: clamp01(point[1]) * (height - 1) };
      if (previous) {
        const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, Math.min(radiusX, radiusY) * 0.45)));
        for (let step = 1; step <= steps; step += 1) {
          const ratio = step / steps;
          paintEllipse(data, width, height, previous.x + ((current.x - previous.x) * ratio), previous.y + ((current.y - previous.y) * ratio), radiusX, radiusY, stroke.mode === 'add' ? 1 : 0);
        }
      } else paintEllipse(data, width, height, current.x, current.y, radiusX, radiusY, stroke.mode === 'add' ? 1 : 0);
      previous = current;
    }
  }
}

function paintEllipse(data, width, height, centerX, centerY, radiusX, radiusY, value) {
  const minX = Math.max(0, Math.floor(centerX - radiusX));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radiusX));
  const minY = Math.max(0, Math.floor(centerY - radiusY));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radiusY));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      if ((dx * dx) + (dy * dy) <= 1) data[(y * width) + x] = value;
    }
  }
}

function slidingExtrema(input, output, width, height, radius, horizontal, isMax) {
  const lineCount = horizontal ? height : width;
  const lineLength = horizontal ? width : height;
  const deque = new Int32Array(lineLength);
  const valueAt = (line, position) => horizontal ? input[(line * width) + position] : input[(position * width) + line];
  const writeAt = (line, position, value) => { output[horizontal ? (line * width) + position : (position * width) + line] = value; };
  for (let line = 0; line < lineCount; line += 1) {
    let head = 0; let tail = 0; let next = 0;
    for (let position = 0; position < lineLength; position += 1) {
      const maxInput = Math.min(lineLength - 1, position + radius);
      while (next <= maxInput) {
        const nextValue = valueAt(line, next);
        while (tail > head && (isMax ? valueAt(line, deque[tail - 1]) <= nextValue : valueAt(line, deque[tail - 1]) >= nextValue)) tail -= 1;
        deque[tail++] = next++;
      }
      while (tail > head && deque[head] < position - radius) head += 1;
      writeAt(line, position, valueAt(line, deque[head]));
    }
  }
}

function movingAverage(input, output, width, height, radius, horizontal) {
  const lineCount = horizontal ? height : width;
  const lineLength = horizontal ? width : height;
  const valueAt = (line, position) => horizontal ? input[(line * width) + position] : input[(position * width) + line];
  const writeAt = (line, position, value) => { output[horizontal ? (line * width) + position : (position * width) + line] = value; };
  for (let line = 0; line < lineCount; line += 1) {
    let sum = 0; let start = 0; let end = Math.min(lineLength - 1, radius);
    for (let index = start; index <= end; index += 1) sum += valueAt(line, index);
    for (let position = 0; position < lineLength; position += 1) {
      writeAt(line, position, sum / Math.max(1, end - start + 1));
      const nextStart = Math.max(0, position + 1 - radius);
      const nextEnd = Math.min(lineLength - 1, position + 1 + radius);
      while (start < nextStart) sum -= valueAt(line, start++);
      while (end < nextEnd) sum += valueAt(line, ++end);
    }
  }
}

function positive(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
