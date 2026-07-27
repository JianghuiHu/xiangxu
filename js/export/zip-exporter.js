export async function createZipBlob(entries) {
  const encodedEntries = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const local = localHeader(name, data.length, crc);
    encodedEntries.push({ name, data, crc, offset, local });
    offset += local.length + data.length;
  }
  const centralParts = encodedEntries.map((entry) => centralHeader(entry.name, entry.data.length, entry.crc, entry.offset));
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = endRecord(encodedEntries.length, centralSize, offset);
  const parts = [];
  encodedEntries.forEach((entry) => parts.push(entry.local, entry.data));
  parts.push(...centralParts, end);
  return new Blob(parts, { type: 'application/zip' });
}

function localHeader(name, size, crc) {
  const bytes = new Uint8Array(30 + name.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(12, 0x0021, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  return bytes;
}

function centralHeader(name, size, crc, offset) {
  const bytes = new Uint8Array(46 + name.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(14, 0x0021, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  bytes.set(name, 46);
  return bytes;
}

function endRecord(count, centralSize, centralOffset) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return bytes;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
