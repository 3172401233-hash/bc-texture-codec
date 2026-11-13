import { createHash } from 'node:crypto';

export function makeRGBA(width, height, fillPixel) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const pixel = fillPixel(x, y);
      data[offset] = pixel[0];
      data[offset + 1] = pixel[1];
      data[offset + 2] = pixel[2];
      data[offset + 3] = pixel[3];
    }
  }
  return data;
}

export function solidImage(width, height, color) {
  return makeRGBA(width, height, () => color);
}

export function colorBars(width, height, alpha = 255) {
  const bars = [
    [255, 0, 0, alpha],
    [0, 255, 0, alpha],
    [0, 0, 255, alpha],
    [255, 255, 0, alpha],
    [0, 255, 255, alpha],
    [255, 0, 255, alpha],
    [255, 255, 255, alpha],
    [0, 0, 0, alpha],
  ];
  return makeRGBA(width, height, (x) => bars[Math.min(bars.length - 1, (x * bars.length / width) | 0)]);
}

export function gradientImage(width, height) {
  return makeRGBA(width, height, (x, y) => [
    (x * 255 / Math.max(1, width - 1)) | 0,
    (y * 255 / Math.max(1, height - 1)) | 0,
    ((x + y) * 255 / Math.max(1, width + height - 2)) | 0,
    255,
  ]);
}

export function randomBlockImage(width, height, seed = 1234) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const blockW = Math.ceil(width / 4);
  const blockH = Math.ceil(height / 4);
  const blockColors = Array.from({ length: blockW * blockH }, () => [
    (next() * 256) | 0,
    (next() * 256) | 0,
    (next() * 256) | 0,
    255,
  ]);
  return makeRGBA(width, height, (x, y) => {
    const blockIndex = ((y / 4) | 0) * blockW + ((x / 4) | 0);
    return blockColors[Math.min(blockColors.length - 1, blockIndex)];
  });
}

export function transparentEdgeImage(width, height, band = 2) {
  return makeRGBA(width, height, (x, y) => {
    const edge = x < band || y < band || x >= width - band || y >= height - band;
    return edge
      ? [0, 0, 0, 0]
      : [40 + (x * 17) % 200, 60 + (y * 29) % 180, 120, 255];
  });
}

export function alphaGradientImage(width, height) {
  return makeRGBA(width, height, (x) => [180, 90, 30, (x * 255 / Math.max(1, width - 1)) | 0]);
}

export function checksum(data) {
  return createHash('sha256').update(data).digest('hex');
}
