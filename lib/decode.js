import { decodeAlphaBlock } from './alpha.js';
import { decodeBC1Block } from './bc1.js';
import { decodeBC3Block } from './bc3.js';
import { BLOCK_SIZE, CHANNELS, FORMAT } from './constants.js';
import {
  assertCompressedBuffer,
  assertDimension,
  assertFormat,
  assertStride,
  blockCount,
  normalizeLevelDescriptors,
} from './validate.js';

export function decode(data, width, height, format, options = {}) {
  assertDimension('width', width);
  assertDimension('height', height);
  assertFormat(format);
  const expectedBytes = compressedByteLength(width, height, format);
  assertCompressedBuffer(data, expectedBytes, width, height, format);

  const stride = options.stride ?? width * CHANNELS;
  assertStride(stride, width);

  const out = new Uint8Array(stride * height);
  const blocksX = blockCount(width);
  const blocksY = blockCount(height);
  let readOffset = 0;

  for (let blockY = 0; blockY < blocksY; blockY += 1) {
    for (let blockX = 0; blockX < blocksX; blockX += 1) {
      const block = format === FORMAT.BC1
        ? decodeBC1Block(data, readOffset, false)
        : decodeBC3Block(data, readOffset);
      readOffset += BLOCK_SIZE[format];
      writeBlock(block, out, width, height, stride, blockX * 4, blockY * 4);
    }
  }
  return { data: out, stride, width, height };
}

function writeBlock(block, out, width, height, stride, baseX, baseY) {
  for (let localY = 0; localY < 4; localY += 1) {
    const y = baseY + localY;
    if (y >= height) {
      continue;
    }
    for (let localX = 0; localX < 4; localX += 1) {
      const x = baseX + localX;
      if (x >= width) {
        continue;
      }
      const sourceOffset = (localY * 4 + localX) * CHANNELS;
      const targetOffset = y * stride + x * CHANNELS;
      out[targetOffset] = block[sourceOffset];
      out[targetOffset + 1] = block[sourceOffset + 1];
      out[targetOffset + 2] = block[sourceOffset + 2];
      out[targetOffset + 3] = block[sourceOffset + 3];
    }
  }
}

export function compressedByteLength(width, height, format) {
  return blockCount(width) * blockCount(height) * BLOCK_SIZE[format];
}

export function decodeMipChain(data, width, height, format, levels = 1, options = {}) {
  assertDimension('width', width);
  assertDimension('height', height);
  assertFormat(format);
  if (!(data instanceof Uint8Array)) {
    throw new TypeError('Compressed data must be a Uint8Array.');
  }
  const descriptors = normalizeLevelDescriptors(width, height, levels);
  const expectedBytes = descriptors.reduce(
    (sum, [levelWidth, levelHeight]) =>
      sum + compressedByteLength(levelWidth, levelHeight, format),
    0,
  );
  assertCompressedBuffer(data, expectedBytes, width, height, format);

  const mips = [];
  let offset = 0;
  for (const [levelWidth, levelHeight] of descriptors) {
    const byteLength = compressedByteLength(levelWidth, levelHeight, format);
    const view = data.subarray(offset, offset + byteLength);
    mips.push(decode(view, levelWidth, levelHeight, format, options));
    offset += byteLength;
  }
  return mips;
}

export { decodeAlphaBlock, decodeBC1Block, decodeBC3Block };
