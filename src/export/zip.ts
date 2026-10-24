interface ZipEntry { name: string; data: Blob }

const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  table[n] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function header(length: number): { bytes: Uint8Array<ArrayBuffer>; view: DataView } {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  return { bytes, view: new DataView(bytes.buffer) };
}

/** ZIP with stored entries. Images are already compressed, so recompressing them adds little. */
export async function makeZip(entries: ZipEntry[]): Promise<Blob> {
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  if (entries.length > 65535) throw new Error('网页素材文件过多，无法打包。');

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.data.size;
    if (name.length > 65535 || size > 0xffffffff || offset + size > 0xffffffff) throw new Error('网页素材过大，无法打包为 ZIP。');
    const checksum = crc32(new Uint8Array(await entry.data.arrayBuffer()));
    const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true); // UTF-8 names
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, size, true);
    local.view.setUint32(22, size, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    localParts.push(local.bytes, entry.data);

    const central = header(46 + name.length);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, size, true);
    central.view.setUint32(24, size, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, offset, true);
    central.bytes.set(name, 46);
    centralParts.push(central.bytes);
    centralSize += central.bytes.length;
    offset += local.bytes.length + size;
  }
  if (offset + centralSize > 0xffffffff) throw new Error('网页素材总量超过 ZIP 格式限制。');
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end.bytes], { type: 'application/zip' });
}
