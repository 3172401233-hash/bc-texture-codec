const CHANNEL_RANGES = [31, 63, 31];
const CHANNEL_SCALES = [8, 4, 8];

function quantizeChannel(channel, value) {
  const scaled = (value + CHANNEL_SCALES[channel] / 2) / CHANNEL_SCALES[channel] | 0;
  if (scaled < 0) {
    return 0;
  }
  const max = CHANNEL_RANGES[channel];
  return scaled > max ? max : scaled;
}

function quantizeColor(color, inset) {
  const quantized = [0, 0, 0];
  for (let channel = 0; channel < 3; channel += 1) {
    let value = quantizeChannel(channel, color[channel]);
    if (inset) {
      value = Math.max(0, Math.min(CHANNEL_RANGES[channel], value - 1));
    }
    quantized[channel] = value;
  }
  return quantized;
}

function boundingBoxDiagonal(pixels, valid) {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 1) {
    if (!valid[i]) {
      continue;
    }
    const pixel = pixels[i];
    for (let channel = 0; channel < 3; channel += 1) {
      if (pixel[channel] < min[channel]) {
        min[channel] = pixel[channel];
      }
      if (pixel[channel] > max[channel]) {
        max[channel] = pixel[channel];
      }
    }
  }
  return { min, max };
}

export function fitEndpoints(pixels, valid, mode = 'bbox') {
  if (mode !== 'bbox' && mode !== 'inset') {
    throw new Error(`Unknown endpoint color mode "${String(mode)}"; expected "bbox" or "inset".`);
  }
  const { min, max } = boundingBoxDiagonal(pixels, valid);
  let lowPixel = min;
  let highPixel = max;

  let bestSpread = -1;
  for (let i = 0; i < pixels.length; i += 1) {
    if (!valid[i]) {
      continue;
    }
    for (let j = i + 1; j < pixels.length; j += 1) {
      if (!valid[j]) {
        continue;
      }
      const a = pixels[i];
      const b = pixels[j];
      const dr = a[0] - b[0];
      const dg = a[1] - b[1];
      const db = a[2] - b[2];
      const spread = dr * dr + dg * dg + db * db;
      if (spread > bestSpread) {
        bestSpread = spread;
        const aPacked = a[0] * 65025 + a[1] * 255 + a[2];
        const bPacked = b[0] * 65025 + b[1] * 255 + b[2];
        lowPixel = aPacked <= bPacked ? a : b;
        highPixel = aPacked <= bPacked ? b : a;
      }
    }
  }

  return {
    qMin: quantizeColor(lowPixel, mode === 'inset'),
    qMax: quantizeColor(highPixel, false),
  };
}
