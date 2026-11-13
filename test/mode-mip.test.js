import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareImages,
  compressedSize,
  decode,
  decodeMipChain,
  encode,
  encodeMipChain,
  FORMAT,
} from '../lib/index.js';
import { checksum, gradientImage, randomBlockImage } from './helpers.js';

for (const format of [FORMAT.BC1, FORMAT.BC3]) {
  test(`${format}: bbox and inset color modes both decode`, () => {
    const image = gradientImage(16, 16);
    const bbox = encode(image, 16, 16, format, { colorMode: 'bbox' });
    const inset = encode(image, 16, 16, format, { colorMode: 'inset' });
    assert.notEqual(checksum(bbox), checksum(inset));
    for (const encoded of [bbox, inset]) {
      const decoded = decode(encoded, 16, 16, format);
      const metrics = compareImages(image, decoded.data, 16, 16);
      assert.ok(metrics.rgbPsnr >= 18, `rgb PSNR ${metrics.rgbPsnr.toFixed(2)} below 18 dB`);
    }
  });

  test(`${format}: mip chain size matches per-level block counts`, () => {
    const width = 16;
    const height = 8;
    const image = randomBlockImage(width, height, 5);
    const chain = encodeMipChain(image, width, height, format, 4);
    assert.equal(chain.levels.length, 4);
    assert.deepEqual(chain.levels.map((level) => [level.width, level.height]),
      [[16, 8], [8, 4], [4, 2], [2, 1]]);
    const expected = chain.levels.reduce(
      (sum, level) => sum + compressedSize(level.width, level.height, format),
      0,
    );
    assert.equal(chain.data.byteLength, expected);
    const mips = decodeMipChain(chain.data, width, height, format, 4);
    assert.equal(mips.length, 4);
    mips.forEach((mip, index) => {
      assert.equal(mip.width, chain.levels[index].width);
      assert.equal(mip.height, chain.levels[index].height);
      assert.equal(mip.data.byteLength, mip.stride * mip.height);
    });
  });

  test(`${format}: full mip chain reaches 1x1`, () => {
    const image = gradientImage(8, 8);
    const chain = encodeMipChain(image, 8, 8, format, 4);
    assert.equal(chain.levels.at(-1).width, 1);
    assert.equal(chain.levels.at(-1).height, 1);
    const mips = decodeMipChain(chain.data, 8, 8, format, 4);
    assert.equal(mips.at(-1).width, 1);
    assert.equal(mips.at(-1).height, 1);
    assert.equal(mips.at(-1).data.byteLength, 4);
  });

  test(`${format}: invalid mip descriptors are rejected`, () => {
    const image = gradientImage(8, 8);
    assert.throws(() => encodeMipChain(image, 8, 8, format, 99), /mip level/i);
    assert.throws(
      () => encodeMipChain(image, 8, 8, format, [[8, 8], [3, 3]]),
      (error) => error.code === 'INVALID_MIP',
    );
  });

  test(`${format}: reports compression ratio and PSNR for build report`, () => {
    const image = randomBlockImage(64, 64, 99);
    const encoded = encode(image, 64, 64, format);
    const decoded = decode(encoded, 64, 64, format);
    const metrics = compareImages(image, decoded.data, 64, 64);
    const sourceBytes = 64 * 64 * 4;
    const ratio = sourceBytes / encoded.byteLength;
    assert.equal(ratio, format === FORMAT.BC1 ? 8 : 4);
    assert.ok(Number.isFinite(metrics.rgbPsnr));
    assert.ok(metrics.rgbPsnr > 20);
    assert.ok(Number.isFinite(metrics.rgbaPsnr));
  });
}

test('mip chain truncation detection on decode', () => {
  const image = gradientImage(16, 16);
  const chain = encodeMipChain(image, 16, 16, FORMAT.BC3, 3);
  assert.throws(
    () => decodeMipChain(chain.data.subarray(0, chain.data.length - 8), 16, 16, FORMAT.BC3, 3),
    (error) => error.code === 'BUFFER_TOO_SMALL',
  );
});
