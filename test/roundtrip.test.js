import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareImages,
  compressedSize,
  decode,
  encode,
  FORMAT,
  meanAlphaError,
} from '../lib/index.js';
import {
  alphaGradientImage,
  checksum,
  colorBars,
  gradientImage,
  randomBlockImage,
  solidImage,
  transparentEdgeImage,
} from './helpers.js';

const ODD_SIZES = [
  [1, 1],
  [3, 5],
  [5, 7],
  [13, 9],
  [17, 3],
  [31, 17],
];

function roundtrip(image, width, height, format, options) {
  const encoded = encode(image, width, height, format, options);
  assert.equal(encoded.byteLength, compressedSize(width, height, format));
  const decoded = decode(encoded, width, height, format);
  assert.equal(decoded.data.byteLength, width * 4 * height);
  assert.equal(decoded.stride, width * 4);
  return { encoded, decoded, metrics: compareImages(image, decoded.data, width, height) };
}

for (const format of [FORMAT.BC1, FORMAT.BC3]) {
  test(`${format}: solid color round trip`, () => {
    const image = solidImage(16, 16, [100, 150, 200, 255]);
    const { metrics } = roundtrip(image, 16, 16, format);
    assert.ok(metrics.rgbPsnr >= 30, `rgb PSNR ${metrics.rgbPsnr.toFixed(2)} below 30 dB`);
  });

  test(`${format}: color bars round trip`, () => {
    const image = colorBars(32, 16);
    const { metrics } = roundtrip(image, 32, 16, format);
    assert.ok(metrics.rgbPsnr >= 30, `rgb PSNR ${metrics.rgbPsnr.toFixed(2)} below 30 dB`);
  });

  test(`${format}: high contrast gradient round trip`, () => {
    const image = gradientImage(32, 32);
    const { metrics } = roundtrip(image, 32, 32, format);
    const floor = format === FORMAT.BC1 ? 30 : 24;
    assert.ok(metrics.rgbPsnr >= floor, `rgb PSNR ${metrics.rgbPsnr.toFixed(2)} below ${floor} dB`);
  });

  test(`${format}: random block image round trip`, () => {
    const image = randomBlockImage(32, 32, 777);
    const { metrics } = roundtrip(image, 32, 32, format);
    assert.ok(metrics.rgbPsnr >= 30, `rgb PSNR ${metrics.rgbPsnr.toFixed(2)} below 30 dB`);
  });

  for (const [width, height] of ODD_SIZES) {
    test(`${format}: edge blocks for ${width}x${height}`, () => {
      const image = randomBlockImage(width, height, 11);
      const { encoded, decoded, metrics } = roundtrip(image, width, height, format);
      const expectedBlocks = Math.ceil(width / 4) * Math.ceil(height / 4);
      assert.equal(encoded.byteLength, expectedBlocks * (format === FORMAT.BC1 ? 8 : 16));
      assert.ok(metrics.rgbPsnr >= 20, `rgb PSNR ${metrics.rgbPsnr.toFixed(2)} below 20 dB`);
      assert.equal(decoded.data[decoded.data.length - 1] !== undefined, true);
    });
  }

  test(`${format}: blocks never share state across boundaries`, () => {
    const image = colorBars(32, 32);
    const first = encode(image, 32, 32, format);
    const second = encode(colorBars(32, 32), 32, 32, format);
    assert.equal(checksum(first), checksum(second));
    const decodedA = decode(first, 32, 32, format).data;
    const decodedB = decode(second, 32, 32, format).data;
    assert.deepEqual(decodedA, decodedB);
  });

  test(`${format}: repeated runs are byte-identical`, () => {
    const image = randomBlockImage(24, 20, 42);
    const runs = Array.from({ length: 4 }, () => encode(image, 24, 20, format));
    for (const run of runs) {
      assert.equal(checksum(run), checksum(runs[0]));
    }
  });

  test(`${format}: custom stride is respected on decode`, () => {
    const width = 10;
    const height = 6;
    const image = randomBlockImage(width, height, 3);
    const encoded = encode(image, width, height, format);
    const stride = width * 4 + 12;
    const decoded = decode(encoded, width, height, format, { stride });
    assert.equal(decoded.stride, stride);
    assert.equal(decoded.data.byteLength, stride * height);
    const metrics = compareImages(image, decoded.data, width, height, { stride });
    assert.ok(metrics.rgbPsnr >= 25);
  });
}

test('BC1: fully transparent block decodes with zero alpha', () => {
  const image = solidImage(4, 4, [0, 0, 0, 0]);
  const encoded = encode(image, 4, 4, FORMAT.BC1);
  const decoded = decode(encoded, 4, 4, FORMAT.BC1).data;
  for (let i = 0; i < 16; i += 1) {
    assert.equal(decoded[i * 4 + 3], 0);
  }
});

test('BC1: partial transparency inside one block uses index 3', () => {
  const image = makeRGBA(4, 4, (x) => (x < 2 ? [200, 30, 30, 0] : [40, 40, 220, 255]));
  const encoded = encode(image, 4, 4, FORMAT.BC1);
  const c0 = encoded[0] | (encoded[1] << 8);
  const c1 = encoded[2] | (encoded[3] << 8);
  assert.ok(c0 <= c1);
  const decoded = decode(encoded, 4, 4, FORMAT.BC1).data;
  for (let x = 0; x < 2; x += 1) {
    assert.equal(decoded[x * 4 + 3], 0);
  }
  for (let x = 2; x < 4; x += 1) {
    assert.equal(decoded[x * 4 + 3], 255);
  }
});

test('BC3: alpha gradient stays within quantization budget', () => {
  const image = alphaGradientImage(16, 4);
  const { decoded, metrics } = roundtrip(image, 16, 4, FORMAT.BC3);
  const alphaError = meanAlphaError(image, decoded.data, 16, 4);
  assert.ok(alphaError <= 8, `mean alpha error ${alphaError.toFixed(2)} too large`);
  assert.ok(Number.isFinite(metrics.rgbaPsnr));
});

test('BC3: transparent edges are preserved on odd sizes', () => {
  const width = 11;
  const height = 9;
  const image = transparentEdgeImage(width, height, 2);
  const { decoded } = roundtrip(image, width, height, FORMAT.BC3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const alpha = decoded.data[(y * width + x) * 4 + 3];
      if (edge) {
        assert.equal(alpha, 0);
      } else {
        assert.ok(alpha > 240);
      }
    }
  }
});

test('BC3: fully opaque image keeps every alpha at 255', () => {
  const image = solidImage(8, 8, [12, 200, 77, 255]);
  const decoded = decode(encode(image, 8, 8, FORMAT.BC3), 8, 8, FORMAT.BC3).data;
  for (let i = 3; i < decoded.length; i += 4) {
    assert.equal(decoded[i], 255);
  }
});

function makeRGBA(width, height, fillPixel) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const pixel = fillPixel(x, y);
      data.set(pixel, offset);
    }
  }
  return data;
}
