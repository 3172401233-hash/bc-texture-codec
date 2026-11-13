import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodecError, compressedSize, decode, encode, FORMAT, MAX_DIMENSION } from '../lib/index.js';
import { solidImage } from './helpers.js';

const image = solidImage(8, 8, [10, 20, 30, 255]);

test('rejects zero width or height', () => {
  assert.throws(() => encode(image, 0, 8, FORMAT.BC1), (error) => error instanceof CodecError && error.code === 'INVALID_DIMENSION');
  assert.throws(() => encode(image, 8, 0, FORMAT.BC3), (error) => error instanceof CodecError && error.code === 'INVALID_DIMENSION');
});

test('rejects negative and non-integer dimensions', () => {
  assert.throws(() => encode(image, -4, 8, FORMAT.BC1), CodecError);
  assert.throws(() => encode(image, 8.5, 8, FORMAT.BC1), CodecError);
  assert.throws(() => decode(new Uint8Array(8), 8, NaN, FORMAT.BC1), CodecError);
});

test('rejects oversized dimensions', () => {
  assert.throws(
    () => encode(image, MAX_DIMENSION + 1, 4, FORMAT.BC1),
    (error) => error.code === 'DIMENSION_TOO_LARGE',
  );
});

test('rejects non-Uint8Array RGBA8 input', () => {
  assert.throws(() => encode(new Array(256), 8, 8, FORMAT.BC1), (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => encode(undefined, 8, 8, FORMAT.BC1), CodecError);
});

test('rejects undersized RGBA8 buffer', () => {
  assert.throws(
    () => encode(image.subarray(0, 10), 8, 8, FORMAT.BC1),
    (error) => error.code === 'BUFFER_TOO_SMALL',
  );
});

test('rejects undersized compressed buffer', () => {
  const encoded = encode(image, 8, 8, FORMAT.BC1);
  assert.throws(
    () => decode(encoded.subarray(0, encoded.length - 1), 8, 8, FORMAT.BC1),
    (error) => error.code === 'BUFFER_TOO_SMALL',
  );
});

test('rejects unknown format and bad options', () => {
  assert.throws(() => encode(image, 8, 8, 'BC7'), (error) => error.code === 'INVALID_FORMAT');
  assert.throws(() => encode(image, 8, 8, FORMAT.BC1, { colorMode: 'magic' }), (error) => error.code === 'INVALID_OPTION');
  assert.throws(() => encode(image, 8, 8, FORMAT.BC1, { alphaThreshold: 300 }), (error) => error.code === 'INVALID_OPTION');
});

test('reports compressed sizes including padded edge blocks', () => {
  assert.equal(compressedSize(8, 8, FORMAT.BC1), 32);
  assert.equal(compressedSize(8, 8, FORMAT.BC3), 64);
  assert.equal(compressedSize(5, 7, FORMAT.BC1), 32);
  assert.equal(compressedSize(5, 7, FORMAT.BC3), 64);
  assert.equal(compressedSize(1, 1, FORMAT.BC1), 8);
  assert.equal(compressedSize(13, 1, FORMAT.BC3), 64);
});

test('rejects invalid stride', () => {
  const encoded = encode(image, 8, 8, FORMAT.BC1);
  assert.throws(() => decode(encoded, 8, 8, FORMAT.BC1, { stride: 31 }), (error) => error.code === 'INVALID_STRIDE');
  assert.throws(() => decode(encoded, 8, 8, FORMAT.BC1, { stride: 0 }), CodecError);
});
