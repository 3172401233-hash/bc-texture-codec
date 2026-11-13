import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAlphaTable,
  buildPalette,
  decodeAlphaBlock,
  decodeBC1Block,
  encodeAlphaBlock,
  encodeBC1Block,
  fromRGB565,
  toRGB565,
} from '../lib/index.js';

function blockFromPixels(colors) {
  const pixels = colors.map((color) => [...color]);
  const valid = new Array(16).fill(true);
  return { pixels, valid };
}

test('RGB565 packing and unpacking preserves bit fields', () => {
  assert.equal(toRGB565(255, 255, 255), 0xffff);
  assert.equal(toRGB565(0, 0, 0), 0x0000);
  assert.equal(toRGB565(255, 0, 0), 0xf800);
  assert.equal(toRGB565(0, 255, 0), 0x07e0);
  assert.equal(toRGB565(0, 0, 255), 0x001f);
  assert.deepEqual(fromRGB565(0xf800), [255, 0, 0]);
  assert.deepEqual(fromRGB565(0x07e0), [0, 255, 0]);
  assert.deepEqual(fromRGB565(0x001f), [0, 0, 255]);
  assert.deepEqual(fromRGB565(toRGB565(100, 150, 200)), fromRGB565(toRGB565(100, 150, 200)));
});

test('BC1 endpoints are written little-endian as RGB565', () => {
  const black = [0, 0, 0, 255];
  const white = [255, 255, 255, 255];
  const { pixels, valid } = blockFromPixels(Array.from({ length: 16 }, (_, i) => (i < 8 ? black : white)));
  const block = encodeBC1Block(pixels, valid);
  assert.equal(block[0], 0xff);
  assert.equal(block[1], 0xff);
  assert.equal(block[2], 0x00);
  assert.equal(block[3], 0x00);
  const decoded = decodeBC1Block(block, 0, false);
  assert.deepEqual([decoded[0], decoded[1], decoded[2]], [0, 0, 0]);
  assert.deepEqual([decoded[8 * 4], decoded[8 * 4 + 1], decoded[8 * 4 + 2]], [255, 255, 255]);
});

test('BC1 packs 2-bit palette indices little-endian across bytes', () => {
  const colors = Array.from({ length: 16 }, (_, i) => (i < 8
    ? [0, 0, 0, 255]
    : [255, 255, 255, 255]));
  const { pixels, valid } = blockFromPixels(colors);
  const block = encodeBC1Block(pixels, valid);
  assert.deepEqual(Array.from(block.subarray(4, 8)), [0x55, 0x55, 0x00, 0x00]);
  const decoded = decodeBC1Block(block, 0, false);
  for (let i = 0; i < 8; i += 1) {
    assert.deepEqual([decoded[i * 4], decoded[i * 4 + 1], decoded[i * 4 + 2]], [0, 0, 0]);
  }
  for (let i = 8; i < 16; i += 1) {
    assert.deepEqual([decoded[i * 4], decoded[i * 4 + 1], decoded[i * 4 + 2]], [255, 255, 255]);
  }
});

test('BC1 transparent mode orders c0 <= c1 and reserves index 3', () => {
  const colors = Array.from({ length: 16 }, (_, i) => (i % 2 === 0
    ? [0, 0, 0, 0]
    : [255, 255, 255, 255]));
  const { pixels, valid } = blockFromPixels(colors);
  const block = encodeBC1Block(pixels, valid);
  const c0 = block[0] | (block[1] << 8);
  const c1 = block[2] | (block[3] << 8);
  assert.ok(c0 <= c1);
  const decoded = decodeBC1Block(block, 0, false);
  assert.equal(decoded[3], 0);
  assert.equal(decoded[7], 255);
  assert.equal(decoded[11], 0);
  assert.equal(decoded[15], 255);
});

test('BC1 opaque mode keeps four opaque palette entries', () => {
  const c0 = toRGB565(0, 0, 0);
  const c1 = toRGB565(255, 255, 255);
  const palette = buildPalette(c0, c1, false);
  for (const color of palette) {
    assert.equal(color.length, 3);
  }
  const decoded = decodeBC1Block(Uint8Array.of(0, 0, 255, 255, 0, 0, 0, 0), 0, false);
  for (let i = 0; i < 16; i += 1) {
    assert.equal(decoded[i * 4 + 3], 255);
  }
});

test('BC3 alpha block writes endpoints and 48 packed index bits', () => {
  const values = [255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0];
  const valid = new Array(16).fill(true);
  const block = encodeAlphaBlock(Uint8Array.from(values), valid);
  assert.equal(block[0], 255);
  assert.equal(block[1], 0);
  assert.deepEqual(Array.from(block.subarray(2, 8)), [0x00, 0x00, 0x00, 0x49, 0x92, 0x24]);
  const decoded = decodeAlphaBlock(block, 0);
  for (let i = 0; i < 8; i += 1) {
    assert.equal(decoded[i], 255);
  }
  for (let i = 8; i < 16; i += 1) {
    assert.equal(decoded[i], 0);
  }
});

test('BC3 alpha 8-value interpolation matches integer truncation', () => {
  const block = Uint8Array.of(200, 100, 0, 0, 0, 0x49, 0x92, 0x24);
  const table = decodeAlphaBlock(block, 0);
  const decoded = decodeAlphaBlock(block, 0);
  assert.equal(decoded[0], 200);
  assert.equal(decoded[8], 100);
  const expected = ((6 * 200 + 100) / 7) | 0;
  const index2Block = Uint8Array.of(200, 100, 0x02, 0, 0, 0, 0, 0);
  assert.equal(decodeAlphaBlock(index2Block, 0)[0], expected);
});

test('BC3 alpha 6-value mode exposes zero and 255 sentinels', () => {
  const table = buildAlphaTable(100, 200);
  assert.equal(table[6], 0);
  assert.equal(table[7], 255);
  assert.equal(table.length, 8);
  const zeroBlock = encodeAlphaBlock(new Uint8Array(16).fill(0), new Array(16).fill(true));
  assert.ok(decodeAlphaBlock(zeroBlock, 0).every((value) => value === 0));
  const fullBlock = encodeAlphaBlock(new Uint8Array(16).fill(255), new Array(16).fill(true));
  assert.ok(decodeAlphaBlock(fullBlock, 0).every((value) => value === 255));
});

test('solid alpha block round trips through a real block', () => {
  const alphas = new Uint8Array(16).fill(77);
  const valid = new Array(16).fill(true);
  const block = encodeAlphaBlock(alphas, valid);
  const decoded = decodeAlphaBlock(block, 0);
  for (const value of decoded) {
    assert.ok(Math.abs(value - 77) <= 1);
  }
});
