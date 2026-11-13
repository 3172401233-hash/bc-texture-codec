import { fitEndpoints } from './endpoints.js';
import { fromRGB565, readPackedRGB565, toRGB565, writePackedRGB565 } from './rgb565.js';

function pack565(color) {
  return (color[0] << 11) | (color[1] << 5) | color[2];
}

export function buildPalette(c0, c1, transparentMode) {
  const rgb0 = fromRGB565(c0);
  const rgb1 = fromRGB565(c1);
  const palette = new Array(4);
  palette[0] = rgb0;
  palette[1] = rgb1;
  if (transparentMode) {
    palette[2] = [
      (rgb0[0] + rgb1[0]) >> 1,
      (rgb0[1] + rgb1[1]) >> 1,
      (rgb0[2] + rgb1[2]) >> 1,
    ];
    palette[3] = [0, 0, 0];
  } else {
    palette[2] = [
      (rgb0[0] * 2 + rgb1[0]) / 3 | 0,
      (rgb0[1] * 2 + rgb1[1]) / 3 | 0,
      (rgb0[2] * 2 + rgb1[2]) / 3 | 0,
    ];
    palette[3] = [
      (rgb0[0] + rgb1[0] * 2) / 3 | 0,
      (rgb0[1] + rgb1[1] * 2) / 3 | 0,
      (rgb0[2] + rgb1[2] * 2) / 3 | 0,
    ];
  }
  return palette;
}

function nearestPaletteIndex(palette, pixel) {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < palette.length; index += 1) {
    const color = palette[index];
    const dr = pixel[0] - color[0];
    const dg = pixel[1] - color[1];
    const db = pixel[2] - color[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function writeIndices(out, offset, indices) {
  let bitOffset = 0;
  for (let i = 0; i < 16; i += 1) {
    out[offset + 4 + (bitOffset >> 3)] |= (indices[i] & 0x03) << (bitOffset & 7);
    bitOffset += 2;
  }
}

function readIndices(data, offset) {
  const indices = new Uint8Array(16);
  let bitOffset = 0;
  for (let i = 0; i < 16; i += 1) {
    const byteIndex = offset + 4 + (bitOffset >> 3);
    const shift = bitOffset & 7;
    const word = data[byteIndex] | (data[byteIndex + 1] << 8);
    indices[i] = (word >>> shift) & 0x03;
    bitOffset += 2;
  }
  return indices;
}

export function encodeBC1Block(pixels, valid, options = {}) {
  const mode = options.colorMode || 'bbox';
  const threshold = options.alphaThreshold ?? 128;
  const out = new Uint8Array(8);

  const transparent = new Array(16);
  let hasTransparent = false;
  let hasOpaque = false;
  for (let i = 0; i < 16; i += 1) {
    const isTransparent = valid[i] && pixels[i][3] < threshold;
    transparent[i] = isTransparent;
    if (isTransparent) {
      hasTransparent = true;
    } else if (valid[i]) {
      hasOpaque = true;
    }
  }

  const fitValid = new Array(16);
  for (let i = 0; i < 16; i += 1) {
    fitValid[i] = valid[i] && !transparent[i];
  }

  let c0;
  let c1;
  let transparentMode;

  if (!hasOpaque) {
    c0 = 0;
    c1 = 1;
    transparentMode = true;
  } else {
    const fitted = fitEndpoints(pixels, fitValid, mode);
    let q0 = pack565(fitted.qMin);
    let q1 = pack565(fitted.qMax);
    transparentMode = hasTransparent;
    if (q0 === q1) {
      if (transparentMode) {
        if (q0 === 0) {
          q1 = 1;
        } else {
          q1 = (q0 - 1) >>> 0;
        }
      }
    }
    let low = Math.min(q0, q1);
    let high = Math.max(q0, q1);
    if (transparentMode) {
      q0 = low;
      q1 = high;
    } else {
      q0 = high;
      q1 = low;
    }
    c0 = q0;
    c1 = q1;
  }

  writePackedRGB565(out, 0, c0);
  writePackedRGB565(out, 2, c1);
  const palette = buildPalette(c0, c1, transparentMode);

  const indices = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    if (!valid[i]) {
      indices[i] = 0;
    } else if (transparent[i]) {
      indices[i] = 3;
    } else {
      indices[i] = nearestPaletteIndex(palette, pixels[i]);
    }
  }
  writeIndices(out, 0, indices);
  return out;
}

export function decodeBC1Block(data, offset, transparent) {
  const c0 = readPackedRGB565(data, offset);
  const c1 = readPackedRGB565(data, offset + 2);
  const transparentMode = transparent === true || c0 <= c1;
  const palette = buildPalette(c0, c1, transparentMode);
  const indices = readIndices(data, offset);
  const rgba = new Uint8Array(64);

  for (let i = 0; i < 16; i += 1) {
    const index = indices[i];
    const outOffset = i * 4;
    let alpha = 255;
    let colorIndex = index;
    if (transparentMode && index === 3) {
      alpha = 0;
      colorIndex = 0;
    }
    const color = palette[colorIndex];
    rgba[outOffset] = color[0];
    rgba[outOffset + 1] = color[1];
    rgba[outOffset + 2] = color[2];
    rgba[outOffset + 3] = alpha;
  }
  return rgba;
}
