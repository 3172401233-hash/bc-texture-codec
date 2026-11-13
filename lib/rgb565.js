export function toRGB565(r, g, b) {
  const r5 = Math.max(0, Math.min(31, (r * 31 + 127) / 255 | 0));
  const g6 = Math.max(0, Math.min(63, (g * 63 + 127) / 255 | 0));
  const b5 = Math.max(0, Math.min(31, (b * 31 + 127) / 255 | 0));
  return (r5 << 11) | (g6 << 5) | b5;
}

export function fromRGB565(packed) {
  const r5 = (packed >> 11) & 0x1f;
  const g6 = (packed >> 5) & 0x3f;
  const b5 = packed & 0x1f;
  return [
    (r5 << 3) | (r5 >> 2),
    (g6 << 2) | (g6 >> 4),
    (b5 << 3) | (b5 >> 2),
  ];
}

export function writePackedRGB565(out, offset, packed) {
  out[offset] = packed & 0xff;
  out[offset + 1] = (packed >> 8) & 0xff;
}

export function readPackedRGB565(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}
