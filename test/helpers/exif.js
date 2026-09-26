// Минимальный EXIF для тестов (Make, Orientation, DPI): sharp 0.32 не умеет писать произвольные теги.
function exifSegment({ make = 'TestCam', orientation = 1, density = 0 } = {}) {
  const makeBuf = Buffer.from(`${make}\0`, 'ascii');
  const entries = [
    { tag: 0x010f, type: 2, count: makeBuf.length, data: makeBuf },
    { tag: 0x0112, type: 3, count: 1, value: orientation }
  ];
  if (density) {
    const rational = () => {
      const b = Buffer.alloc(8);
      b.writeUInt32LE(density, 0);
      b.writeUInt32LE(1, 4);
      return b;
    };
    entries.push({ tag: 0x011a, type: 5, count: 1, data: rational() });
    entries.push({ tag: 0x011b, type: 5, count: 1, data: rational() });
    entries.push({ tag: 0x0128, type: 3, count: 1, value: 2 }); // дюймы
  }
  entries.sort((a, b) => a.tag - b.tag);

  const ifdSize = 2 + entries.length * 12 + 4;
  const extra = entries.reduce((n, e) => n + (e.data ? e.data.length : 0), 0);
  const tiff = Buffer.alloc(8 + ifdSize + extra);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(entries.length, 8);
  let dataOffset = 8 + ifdSize;
  entries.forEach((e, i) => {
    const o = 10 + i * 12;
    tiff.writeUInt16LE(e.tag, o);
    tiff.writeUInt16LE(e.type, o + 2);
    tiff.writeUInt32LE(e.count, o + 4);
    if (e.data) {
      tiff.writeUInt32LE(dataOffset, o + 8);
      e.data.copy(tiff, dataOffset);
      dataOffset += e.data.length;
    } else {
      tiff.writeUInt16LE(e.value, o + 8);
    }
  });
  tiff.writeUInt32LE(0, 8 + ifdSize - 4);

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** Заменяет EXIF в JPEG-буфере на тестовый (прочие сегменты сохраняются). */
function withExif(jpeg, opts) {
  const parts = [jpeg.subarray(0, 2)];
  let i = 2;
  // Пропускаем существующие APP1 с EXIF, остальные маркеры до данных изображения копируем как есть.
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff && jpeg[i + 1] >= 0xe0 && jpeg[i + 1] <= 0xef) {
    const len = jpeg.readUInt16BE(i + 2);
    const isExif = jpeg[i + 1] === 0xe1 && jpeg.subarray(i + 4, i + 10).toString('binary') === 'Exif\0\0';
    if (!isExif) parts.push(jpeg.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  parts.push(exifSegment(opts), jpeg.subarray(i));
  return Buffer.concat(parts);
}

module.exports = { withExif };
