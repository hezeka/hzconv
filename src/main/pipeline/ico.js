// src/main/pipeline/ico.js
// ICO с PNG-кадрами внутри (поддерживается всеми системами начиная с Windows Vista).
const sharp = require('sharp');

async function encodeIco(master, sizes) {
  const unique = [...new Set(sizes.map((s) => Math.round(s)))].sort((a, b) => a - b);
  const frames = await Promise.all(
    unique.map((size) =>
      sharp(master)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: size <= 32 ? 'lanczos2' : 'lanczos3' })
        .png({ compressionLevel: 9 })
        .toBuffer()
    )
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // тип: иконка
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + 16 * frames.length;
  frames.forEach((png, i) => {
    const size = unique[i];
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 означает 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // палитра
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  });

  return Buffer.concat([header, ...entries, ...frames]);
}

module.exports = { encodeIco };
