// Encode an ink mask as a PNG with colour type 4 (grey + alpha): grey is 0,
// alpha is the ink. Any image viewer shows it as black writing on transparent,
// and the renderer can tint it any colour. Alpha is quantized to 32 levels
// first, which is invisible on screen but compresses much better. Deflate is
// the browser's own (CompressionStream), so no library is needed.

const LEVELS = 32;
const QUANTIZE = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  QUANTIZE[v] = Math.round((Math.round((v / 255) * (LEVELS - 1)) * 255) / (LEVELS - 1));
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BPP = 2; // bytes per pixel: grey, alpha

export async function encodeInkPng(mask) {
  const { width, height, alpha } = mask;
  const stride = width * BPP;
  const filtered = new Uint8Array((stride + 1) * height);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  const trial = new Uint8Array(stride);
  const best = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    // Grey bytes stay 0; only the alpha bytes are written.
    for (let x = 0, i = y * width; x < width; x++, i++) cur[x * BPP + 1] = QUANTIZE[alpha[i]];

    // Pick the PNG filter that leaves the smallest residuals for this row.
    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      const score = filterRow(type, cur, prev, trial, bestScore);
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        best.set(trial);
      }
    }
    const at = y * (stride + 1);
    filtered[at] = bestType;
    filtered.set(best, at + 1);
    [prev, cur] = [cur, prev];
  }

  const idat = await deflate(filtered);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 4; // colour type: grey + alpha
  return new Blob(
    [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))],
    { type: 'image/png' },
  );
}

// Apply PNG filter `type` to `cur` (with `prev` as the row above) into `out`.
// Returns the sum of absolute residuals; gives up with Infinity once it can't
// beat `limit`.
function filterRow(type, cur, prev, out, limit) {
  let score = 0;
  for (let i = 0; i < cur.length; i++) {
    const a = i >= BPP ? cur[i - BPP] : 0;
    const b = prev[i];
    const c = i >= BPP ? prev[i - BPP] : 0;
    let pred;
    if (type === 0) pred = 0;
    else if (type === 1) pred = a;
    else if (type === 2) pred = b;
    else if (type === 3) pred = (a + b) >> 1;
    else {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    const v = (cur[i] - pred) & 255;
    out[i] = v;
    score += v < 128 ? v : 256 - v;
    if (score >= limit) return Infinity;
  }
  return score;
}

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('This browser cannot compress images (no CompressionStream).');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
