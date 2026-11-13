import { decodeAlphaBlock, encodeAlphaBlock } from './alpha.js';
import { decodeBC1Block, encodeBC1Block } from './bc1.js';

export function encodeBC3Block(pixels, valid, options = {}) {
  const alphas = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    alphas[i] = valid[i] ? pixels[i][3] : 255;
  }
  const out = new Uint8Array(16);
  out.set(encodeAlphaBlock(alphas, valid), 0);
  out.set(encodeBC1Block(pixels, valid, options), 8);
  return out;
}

export function decodeBC3Block(data, offset) {
  const alphas = decodeAlphaBlock(data, offset);
  const rgba = decodeBC1Block(data, offset + 8, true);
  for (let i = 0; i < 16; i += 1) {
    rgba[i * 4 + 3] = alphas[i];
  }
  return rgba;
}
