import { encodeAlphaBlock } from './alpha.js';
import { encodeBC1Block } from './bc1.js';
import { encodeBC3Block } from './bc3.js';
import { BLOCK_SIZE, CHANNELS, DEFAULT_ALPHA_THRESHOLD, FORMAT } from './constants.js';
import { CodecError } from './errors.js';
import {
  assertDimension,
  assertFormat,
  assertRGBA8,
  blockCount,
  normalizeLevelDescriptors,
} from './validate.js';

export function compressedSize(width, height, format) {
  assertDimension('width', width);
  assertDimension('height', height);
  assertFormat(format);
  return blockCount(width) * blockCount(height) * BLOCK_SIZE[format];
}

function gatherBlock(rgba, width, height, blockX, blockY) {
  const pixels = new Array(16);
  const valid = new Array(16);
  const baseX = blockX * 4;
  const baseY = blockY * 4;
  for (let localY = 0; localY < 4; localY += 1) {
    for (let localX = 0; localX < 4; localX += 1) {
      const index = localY * 4 + localX;
      const x = baseX + localX;
      const y = baseY + localY;
      if (x < width && y < height) {
        const offset = (y * width + x) * CHANNELS;
        pixels[index] = [
          rgba[offset],
          rgba[offset + 1],
          rgba[offset + 2],
          rgba[offset + 3],
        ];
        valid[index] = true;
      } else {
        const edgeX = Math.min(x, width - 1);
        const edgeY = Math.min(y, height - 1);
        const edgeOffset = (edgeY * width + edgeX) * CHANNELS;
        pixels[index] = [
          rgba[edgeOffset],
          rgba[edgeOffset + 1],
          rgba[edgeOffset + 2],
          rgba[edgeOffset + 3],
        ];
        valid[index] = false;
      }
    }
  }
  return { pixels, valid };
}

function normalizeOptions(options = {}) {
  const colorMode = options.colorMode || 'bbox';
  if (colorMode !== 'bbox' && colorMode !== 'inset') {
    throw new CodecError('INVALID_OPTION',
      `colorMode must be "bbox" or "inset", got ${String(colorMode)}.`);
  }
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new CodecError('INVALID_OPTION',
      `alphaThreshold must be an integer in [0, 255], got ${String(alphaThreshold)}.`);
  }
  return { colorMode, alphaThreshold };
}

export function encode(rgba, width, height, format, options = {}) {
  assertDimension('width', width);
  assertDimension('height', height);
  assertFormat(format);
  assertRGBA8(rgba, width, height);
  const settings = normalizeOptions(options);

  const blocksX = blockCount(width);
  const blocksY = blockCount(height);
  const out = new Uint8Array(blocksX * blocksY * BLOCK_SIZE[format]);
  let writeOffset = 0;

  for (let blockY = 0; blockY < blocksY; blockY += 1) {
    for (let blockX = 0; blockX < blocksX; blockX += 1) {
      const { pixels, valid } = gatherBlock(rgba, width, height, blockX, blockY);
      const block = format === FORMAT.BC1
        ? encodeBC1Block(pixels, valid, settings)
        : encodeBC3Block(pixels, valid, settings);
      out.set(block, writeOffset);
      writeOffset += block.length;
    }
  }
  return out;
}

export function encodeMipChain(rgba, width, height, format, levels = 1, options = {}) {
  assertDimension('width', width);
  assertDimension('height', height);
  assertFormat(format);
  assertRGBA8(rgba, width, height);
  const descriptors = normalizeLevelDescriptors(width, height, levels);

  const totalBytes = descriptors.reduce(
    (sum, [levelWidth, levelHeight]) =>
      sum + compressedSize(levelWidth, levelHeight, format),
    0,
  );
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  let levelWidth = width;
  let levelHeight = height;
  let source = rgba;

  for (let level = 0; level < descriptors.length; level += 1) {
    if (level > 0) {
      const nextWidth = Math.max(1, levelWidth >> 1);
      const nextHeight = Math.max(1, levelHeight >> 1);
      source = downsample2x2(source, levelWidth, levelHeight, nextWidth, nextHeight);
      levelWidth = nextWidth;
      levelHeight = nextHeight;
    }
    const encoded = encode(source, levelWidth, levelHeight, format, options);
    out.set(encoded, offset);
    offset += encoded.byteLength;
  }
  return { data: out, levels: descriptors.map(([w, h]) => ({ width: w, height: h })) };
}

function downsample2x2(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const out = new Uint8Array(targetWidth * targetHeight * CHANNELS);
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y * 2; sy < Math.min(sourceHeight, y * 2 + 2); sy += 1) {
        for (let sx = x * 2; sx < Math.min(sourceWidth, x * 2 + 2); sx += 1) {
          const offset = (sy * sourceWidth + sx) * CHANNELS;
          r += source[offset];
          g += source[offset + 1];
          b += source[offset + 2];
          a += source[offset + 3];
          count += 1;
        }
      }
      const targetOffset = (y * targetWidth + x) * CHANNELS;
      out[targetOffset] = r / count | 0;
      out[targetOffset + 1] = g / count | 0;
      out[targetOffset + 2] = b / count | 0;
      out[targetOffset + 3] = a / count | 0;
    }
  }
  return out;
}

export { encodeAlphaBlock, encodeBC1Block, encodeBC3Block };
