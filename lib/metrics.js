import { CHANNELS } from './constants.js';
import { fail } from './errors.js';

function assertComparable(original, reconstructed, width, height, channels) {
  if (!(original instanceof Uint8Array) || !(reconstructed instanceof Uint8Array)) {
    fail('INVALID_INPUT', 'Both images must be Uint8Array buffers.');
  }
  const required = width * height * channels;
  if (original.byteLength < required) {
    fail('BUFFER_TOO_SMALL', `Original buffer needs ${required} bytes, got ${original.byteLength}.`);
  }
  if (reconstructed.byteLength < required) {
    fail('BUFFER_TOO_SMALL',
      `Reconstructed buffer needs ${required} bytes, got ${reconstructed.byteLength}.`);
  }
}

function mseForChannels(original, reconstructed, width, height, stride, channels) {
  let total = 0;
  const samples = width * height * channels;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * CHANNELS;
      const targetOffset = y * stride + x * CHANNELS;
      for (let channel = 0; channel < channels; channel += 1) {
        const diff = original[sourceOffset + channel] - reconstructed[targetOffset + channel];
        total += diff * diff;
      }
    }
  }
  return total / samples;
}

export function compareImages(original, reconstructed, width, height, options = {}) {
  const stride = options.stride ?? width * CHANNELS;
  assertComparable(original, reconstructed, width, height, CHANNELS);

  const rgbMse = mseForChannels(original, reconstructed, width, height, stride, 3);
  const rgbaMse = mseForChannels(original, reconstructed, width, height, stride, 4);
  return {
    rgbMse,
    rgbaMse,
    rgbPsnr: rgbMse === 0 ? Infinity : 10 * Math.log10((255 * 255) / rgbMse),
    rgbaPsnr: rgbaMse === 0 ? Infinity : 10 * Math.log10((255 * 255) / rgbaMse),
  };
}

export function meanAlphaError(original, reconstructed, width, height, options = {}) {
  const stride = options.stride ?? width * CHANNELS;
  assertComparable(original, reconstructed, width, height, CHANNELS);
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      total += Math.abs(
        original[(y * width + x) * CHANNELS + 3]
        - reconstructed[y * stride + x * CHANNELS + 3],
      );
    }
  }
  return total / (width * height);
}
