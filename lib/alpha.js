export function buildAlphaTable(a0, a1) {
  const table = new Uint8Array(8);
  table[0] = a0;
  table[1] = a1;
  if (a0 > a1) {
    for (let i = 2; i < 8; i += 1) {
      table[i] = ((8 - i) * a0 + (i - 1) * a1) / 7 | 0;
    }
  } else {
    for (let i = 2; i < 6; i += 1) {
      table[i] = ((6 - i) * a0 + (i - 1) * a1) / 5 | 0;
    }
    table[6] = 0;
    table[7] = 255;
  }
  return table;
}

function nearestAlphaIndex(table, value) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < 8; i += 1) {
    const distance = Math.abs(table[i] - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export function encodeAlphaBlock(alphas, valid) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < 16; i += 1) {
    if (!valid[i]) {
      continue;
    }
    if (alphas[i] < min) {
      min = alphas[i];
    }
    if (alphas[i] > max) {
      max = alphas[i];
    }
  }

  const out = new Uint8Array(8);
  if (min === max) {
    if (min <= 255) {
      out[0] = min;
      out[1] = min === 255 ? 254 : min + 1;
    }
  } else {
    out[0] = max;
    out[1] = min;
  }

  const table = buildAlphaTable(out[0], out[1]);
  let bitOffset = 16;
  for (let i = 0; i < 16; i += 1) {
    const index = valid[i] ? nearestAlphaIndex(table, alphas[i]) : 0;
    out[bitOffset >> 3] |= (index & 0x07) << (bitOffset & 7);
    bitOffset += 3;
  }
  return out;
}

export function decodeAlphaBlock(data, offset) {
  const a0 = data[offset];
  const a1 = data[offset + 1];
  const table = buildAlphaTable(a0, a1);
  const alphas = new Uint8Array(16);
  let bitOffset = offset * 8 + 16;
  for (let i = 0; i < 16; i += 1) {
    const byteIndex = bitOffset >> 3;
    const shift = bitOffset & 7;
    const word = data[byteIndex] | (data[byteIndex + 1] << 8);
    const index = (word >>> shift) & 0x07;
    alphas[i] = table[index];
    bitOffset += 3;
  }
  return alphas;
}
