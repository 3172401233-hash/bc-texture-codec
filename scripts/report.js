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
  colorBars,
  gradientImage,
  randomBlockImage,
  solidImage,
  transparentEdgeImage,
} from '../test/helpers.js';

const cases = [
  ['solid color', solidImage(32, 32, [100, 150, 200, 255]), 32, 32],
  ['color bars', colorBars(32, 16), 32, 16],
  ['multi-channel gradient', gradientImage(32, 32), 32, 32],
  ['random blocks', randomBlockImage(32, 32, 777), 32, 32],
  ['odd size 13x9', randomBlockImage(13, 9, 11), 13, 9],
  ['transparent edges', transparentEdgeImage(16, 16, 2), 16, 16],
  ['alpha gradient', alphaGradientImage(16, 4), 16, 4],
];

const lines = [];
lines.push('case,format,source bytes,compressed bytes,ratio,rgb PSNR (dB),rgba PSNR (dB),mean alpha error');
for (const [name, image, width, height] of cases) {
  for (const format of [FORMAT.BC1, FORMAT.BC3]) {
    const encoded = encode(image, width, height, format);
    const decoded = decode(encoded, width, height, format).data;
    const metrics = compareImages(image, decoded, width, height);
    const sourceBytes = width * height * 4;
    const compressedBytes = compressedSize(width, height, format);
    lines.push([
      name,
      format,
      sourceBytes,
      compressedBytes,
      (sourceBytes / compressedBytes).toFixed(1),
      metrics.rgbPsnr === Infinity ? 'lossless' : metrics.rgbPsnr.toFixed(2),
      metrics.rgbaPsnr === Infinity ? 'lossless' : metrics.rgbaPsnr.toFixed(2),
      meanAlphaError(image, decoded, width, height).toFixed(2),
    ].join(','));
  }
}
console.log(lines.join('\n'));
