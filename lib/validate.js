import { CHANNELS, FORMAT, MAX_DIMENSION } from './constants.js';
import { fail } from './errors.js';

export function assertFormat(format) {
  if (format !== FORMAT.BC1 && format !== FORMAT.BC3) {
    fail('INVALID_FORMAT', `Unsupported format "${String(format)}"; expected "BC1" or "BC3".`);
  }
}

export function assertDimension(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    fail('INVALID_DIMENSION', `${name} must be a positive integer, got ${String(value)}.`);
  }
  if (value > MAX_DIMENSION) {
    fail('DIMENSION_TOO_LARGE', `${name} ${value} exceeds maximum texture dimension ${MAX_DIMENSION}.`);
  }
}

export function assertRGBA8(data, width, height) {
  if (!(data instanceof Uint8Array)) {
    fail('INVALID_INPUT', 'Pixel data must be a Uint8Array holding RGBA8 bytes.');
  }
  const required = width * height * CHANNELS;
  if (data.byteLength < required) {
    fail('BUFFER_TOO_SMALL',
      `RGBA8 buffer needs ${required} bytes for ${width}x${height}, got ${data.byteLength}.`);
  }
}

export function assertCompressedBuffer(data, expectedBytes, width, height, format) {
  if (!(data instanceof Uint8Array)) {
    fail('INVALID_INPUT', 'Compressed data must be a Uint8Array.');
  }
  if (data.byteLength < expectedBytes) {
    fail('BUFFER_TOO_SMALL',
      `${format} buffer needs ${expectedBytes} bytes for ${width}x${height}, got ${data.byteLength}.`);
  }
}

export function assertStride(stride, width) {
  if (!Number.isInteger(stride) || stride <= 0) {
    fail('INVALID_STRIDE', `stride must be a positive integer, got ${String(stride)}.`);
  }
  if (stride < width * CHANNELS) {
    fail('INVALID_STRIDE',
      `stride ${stride} is smaller than required row width ${width * CHANNELS}.`);
  }
}

export function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    fail('INVALID_OPTION', `${name} must be a positive integer, got ${String(value)}.`);
  }
}

export function blockCount(dimension) {
  return (dimension + 3) >> 2;
}

export function mipDimensions(width, height) {
  const levels = [];
  let w = width;
  let h = height;
  while (true) {
    levels.push([w, h]);
    if (w === 1 && h === 1) {
      break;
    }
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return levels;
}

export function normalizeLevelDescriptors(width, height, levels) {
  const expected = mipDimensions(width, height);
  if (Array.isArray(levels)) {
    if (levels.length === 0) {
      fail('INVALID_MIP', 'Mip level descriptor list must not be empty.');
    }
    if (levels.length > expected.length) {
      fail('INVALID_MIP',
        `Too many mip levels: ${levels.length}, maximum for ${width}x${height} is ${expected.length}.`);
    }
    for (let i = 0; i < levels.length; i += 1) {
      const descriptor = levels[i];
      if (!Array.isArray(descriptor) || descriptor.length !== 2) {
        fail('INVALID_MIP', `Mip level ${i} descriptor must be a [width, height] pair.`);
      }
      const [w, h] = descriptor;
      if (w !== expected[i][0] || h !== expected[i][1]) {
        fail('INVALID_MIP',
          `Mip level ${i} must be ${expected[i][0]}x${expected[i][1]}, got ${w}x${h}.`);
      }
    }
    return levels.slice();
  }
  if (!Number.isInteger(levels) || levels <= 0) {
    fail('INVALID_MIP', `levels must be a positive integer or [width, height] pairs, got ${String(levels)}.`);
  }
  if (levels > expected.length) {
    fail('INVALID_MIP',
      `Too many mip levels: ${levels}, maximum for ${width}x${height} is ${expected.length}.`);
  }
  return expected.slice(0, levels);
}
