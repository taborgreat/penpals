// A minimal WebM (Matroska) muxer for one video track: what WebCodecs encodes
// becomes a file a browser or player can open. Everything is in memory, so
// every element has its size; clusters start at keyframes.
// https://www.matroska.org/technical/elements.html

const ids = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  CodecID: 0x86,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
};

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const idBytes = (id) => {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 255);
  return Uint8Array.from(out);
};
// An EBML size in 8 bytes (0x01 marker): simple, and always long enough.
const sizeBytes = (n) => {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  for (let i = 7, v = n; i >= 1; i--, v = Math.floor(v / 256)) out[i] = v & 255;
  return out;
};
const uint = (v) => {
  const out = [];
  do {
    out.unshift(v & 255);
    v = Math.floor(v / 256);
  } while (v > 0);
  return Uint8Array.from(out);
};
const f64 = (v) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, v, false);
  return out;
};
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const el = (id, ...body) => {
  const data = concat(body);
  return concat([idBytes(id), sizeBytes(data.length), data]);
};

// chunks: [{ data: Uint8Array, timestamp (µs), key: boolean }] in order.
export function muxWebm({ codec, width, height, chunks, durationMs }) {
  const header = el(
    ids.EBML,
    el(ids.EBMLVersion, uint(1)),
    el(ids.EBMLReadVersion, uint(1)),
    el(ids.EBMLMaxIDLength, uint(4)),
    el(ids.EBMLMaxSizeLength, uint(8)),
    el(ids.DocType, ascii('webm')),
    el(ids.DocTypeVersion, uint(4)),
    el(ids.DocTypeReadVersion, uint(2)),
  );
  const info = el(ids.Info, el(ids.TimecodeScale, uint(1000000)), el(ids.MuxingApp, ascii('penpals')), el(ids.WritingApp, ascii('penpals')), el(ids.Duration, f64(durationMs)));
  const tracks = el(
    ids.Tracks,
    el(
      ids.TrackEntry,
      el(ids.TrackNumber, uint(1)),
      el(ids.TrackUID, uint(1)),
      el(ids.TrackType, uint(1)),
      el(ids.CodecID, ascii(codec)),
      el(ids.Video, el(ids.PixelWidth, uint(width)), el(ids.PixelHeight, uint(height))),
    ),
  );
  const clusters = [];
  let current = null;
  const close = () => {
    if (current) clusters.push(el(ids.Cluster, el(ids.Timecode, uint(current.start)), ...current.blocks));
  };
  for (const c of chunks) {
    const ms = Math.round(c.timestamp / 1000);
    if (!current || c.key || ms - current.start > 30000) {
      close();
      current = { start: ms, blocks: [] };
    }
    const head = new Uint8Array(4);
    head[0] = 0x81; // track 1
    new DataView(head.buffer).setInt16(1, ms - current.start, false);
    head[3] = c.key ? 0x80 : 0;
    current.blocks.push(el(ids.SimpleBlock, head, c.data));
  }
  close();
  return concat([header, el(ids.Segment, info, tracks, ...clusters)]);
}
