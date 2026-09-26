// src/main/pipeline/heif.js
// HEIC/HEIF (фото с iPhone и многих Android). Готовые сборки sharp не декодируют HEVC,
// поэтому кадр раскодирует libheif (WebAssembly) в отдельных потоках, а дальше работает
// обычный конвейер sharp. Промежуточный PNG несёт EXIF и ICC-профиль исходника —
// так дата съёмки, камера и цвета Display P3 не теряются.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Worker } = require('worker_threads');
const sharp = require('sharp');

const HEIF_EXT = new Set(['heic', 'heif', 'hif']);
const isHeifPath = (p) => HEIF_EXT.has(path.extname(p).slice(1).toLowerCase());

// ——— Разбор контейнера (ISO BMFF) ———

function boxes(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) break;
    out.push({ type, start: p, body: p + header, end: p + size });
    p += size;
  }
  return out;
}

const child = (list, type) => list.find((b) => b.type === type);

function readUint(buf, pos, bytes) {
  if (bytes === 0) return 0;
  if (bytes === 2) return buf.readUInt16BE(pos);
  if (bytes === 4) return buf.readUInt32BE(pos);
  if (bytes === 8) return Number(buf.readBigUInt64BE(pos));
  throw new Error(`HEIF: неподдерживаемая ширина поля ${bytes}`);
}

function parseItemInfos(buf, iinf) {
  const version = buf[iinf.body];
  const first = iinf.body + 4 + (version === 0 ? 2 : 4);
  const types = new Map();
  for (const infe of boxes(buf, first, iinf.end).filter((b) => b.type === 'infe')) {
    const v = buf[infe.body];
    if (v < 2) continue;
    let p = infe.body + 4;
    const id = v === 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
    p += (v === 2 ? 2 : 4) + 2;
    types.set(id, buf.toString('latin1', p, p + 4));
  }
  return types;
}

function parseLocations(buf, iloc) {
  const version = buf[iloc.body];
  let p = iloc.body + 4;
  const offsetSize = buf[p] >> 4;
  const lengthSize = buf[p] & 15;
  const baseSize = buf[p + 1] >> 4;
  const indexSize = version === 1 || version === 2 ? buf[p + 1] & 15 : 0;
  p += 2;
  const count = version < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
  p += version < 2 ? 2 : 4;
  const items = new Map();
  for (let i = 0; i < count; i++) {
    const id = version < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
    p += version < 2 ? 2 : 4;
    let method = 0;
    if (version === 1 || version === 2) {
      method = buf.readUInt16BE(p) & 15;
      p += 2;
    }
    p += 2; // data_reference_index
    const base = readUint(buf, p, baseSize);
    p += baseSize;
    const extents = buf.readUInt16BE(p);
    p += 2;
    const list = [];
    for (let e = 0; e < extents; e++) {
      p += indexSize;
      const offset = readUint(buf, p, offsetSize);
      p += offsetSize;
      const length = readUint(buf, p, lengthSize);
      p += lengthSize;
      list.push({ offset: base + offset, length });
    }
    items.set(id, { method, extents: list });
  }
  return items;
}

/** Индексы свойств (1…n) основного изображения. */
function primaryProperties(buf, ipma, primaryId) {
  const version = buf[ipma.body];
  const flags = buf.readUIntBE(ipma.body + 1, 3);
  let p = ipma.body + 4;
  const count = buf.readUInt32BE(p);
  p += 4;
  for (let i = 0; i < count; i++) {
    const id = version < 1 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
    p += version < 1 ? 2 : 4;
    const n = buf[p++];
    const indices = [];
    for (let k = 0; k < n; k++) {
      if (flags & 1) {
        indices.push(buf.readUInt16BE(p) & 0x7fff);
        p += 2;
      } else {
        indices.push(buf[p] & 0x7f);
        p += 1;
      }
    }
    if (id === primaryId) return indices;
  }
  return [];
}

/**
 * EXIF (байты TIFF, начиная с II/MM) и ICC-профиль основного изображения.
 * Ничего не бросает на непривычной структуре — просто вернёт null.
 */
function readHeifMetadata(buf) {
  // transformed: у основного изображения есть irot/imir — libheif сам развернёт кадр.
  const result = { exif: null, icc: null, transformed: false };
  try {
    const meta = child(boxes(buf, 0, buf.length), 'meta');
    if (!meta) return result;
    const list = boxes(buf, meta.body + 4, meta.end);
    const pitm = child(list, 'pitm');
    const primaryId = pitm ? (buf[pitm.body] === 0 ? buf.readUInt16BE(pitm.body + 4) : buf.readUInt32BE(pitm.body + 4)) : null;

    const iprp = child(list, 'iprp');
    if (iprp && primaryId !== null) {
      const props = boxes(buf, iprp.body, iprp.end);
      const ipco = child(props, 'ipco');
      const ipma = child(props, 'ipma');
      if (ipco && ipma) {
        const all = boxes(buf, ipco.body, ipco.end);
        const isIcc = (box) => box?.type === 'colr' && ['prof', 'rICC'].includes(buf.toString('latin1', box.body, box.body + 4));
        // У снимков iPhone профиль привязан к плиткам сетки, а не к самой сетке.
        const primary = primaryProperties(buf, ipma, primaryId).map((i) => all[i - 1]);
        result.transformed = primary.some((box) => box?.type === 'irot' || box?.type === 'imir');
        const own = primary.find(isIcc);
        const box = own || all.find(isIcc);
        if (box) result.icc = Buffer.from(buf.subarray(box.body + 4, box.end));
      }
    }

    const iinf = child(list, 'iinf');
    const iloc = child(list, 'iloc');
    if (iinf && iloc) {
      const types = parseItemInfos(buf, iinf);
      const locations = parseLocations(buf, iloc);
      const idat = child(list, 'idat');
      for (const [id, type] of types) {
        if (type !== 'Exif') continue;
        const loc = locations.get(id);
        if (!loc || loc.method > 1 || (loc.method === 1 && !idat)) continue;
        const origin = loc.method === 1 ? idat.body : 0;
        const data = Buffer.concat(loc.extents.map((e) => buf.subarray(origin + e.offset, origin + e.offset + e.length)));
        if (data.length < 12) continue;
        const tiff = 4 + data.readUInt32BE(0);
        const head = data.toString('latin1', tiff, tiff + 2);
        if (head === 'II' || head === 'MM') result.exif = Buffer.from(data.subarray(tiff));
        break;
      }
    }
  } catch {
    /* метаданные необязательны */
  }
  return result;
}

/**
 * Если libheif уже развернул кадр по irot/imir, ориентация в EXIF должна стать 1 —
 * иначе картинку повернут второй раз. Без irot (так пишут некоторые Android-камеры)
 * EXIF остаётся как есть и поворачивает кадр обычным способом.
 */
function resetOrientation(tiff) {
  const out = Buffer.from(tiff);
  try {
    const le = out.toString('latin1', 0, 2) === 'II';
    const u16 = (p) => (le ? out.readUInt16LE(p) : out.readUInt16BE(p));
    const u32 = (p) => (le ? out.readUInt32LE(p) : out.readUInt32BE(p));
    const ifd = u32(4);
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === 0x0112) {
        if (le) out.writeUInt16LE(1, e + 8);
        else out.writeUInt16BE(1, e + 8);
      }
    }
  } catch {
    /* повреждённый EXIF — оставляем как есть */
  }
  return out;
}

// ——— PNG-обёртка с метаданными ———

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Вставляет iCCP и eXIf сразу после IHDR. */
function withPngMetadata(png, { icc, exif }) {
  const chunks = [];
  if (icc) chunks.push(pngChunk('iCCP', Buffer.concat([Buffer.from('icc\0\0', 'latin1'), zlib.deflateSync(icc)])));
  if (exif) chunks.push(pngChunk('eXIf', exif));
  if (!chunks.length) return png;
  const ihdrEnd = 8 + 8 + png.readUInt32BE(8) + 4;
  return Buffer.concat([png.subarray(0, ihdrEnd), ...chunks, png.subarray(ihdrEnd)]);
}

// ——— Потоки-декодеры ———
// WebAssembly-куча не уменьшается, поэтому простаивающие потоки закрываем.

const WORKER_PATH = path.join(__dirname, 'heif-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const POOL_SIZE = Math.max(1, Math.min(3, os.cpus().length - 1));
const IDLE_MS = 20000;

const idle = [];
const waiting = [];
let alive = 0;
let seq = 0;

function spawnWorker() {
  const worker = new Worker(WORKER_PATH);
  alive++;
  worker.unref();
  const fail = (error) => {
    const task = worker.task;
    worker.task = null;
    task?.reject(error);
  };
  worker.on('message', (msg) => {
    const task = worker.task;
    worker.task = null;
    if (task) {
      if (msg.error) task.reject(new Error(msg.error));
      else task.resolve({ width: msg.width, height: msg.height, alpha: msg.alpha, data: Buffer.from(msg.data) });
    }
    worker.idleTimer = setTimeout(() => worker.terminate(), IDLE_MS);
    idle.push(worker);
    pump();
  });
  worker.on('error', (e) => fail(new Error(`Не удалось раскодировать HEIF: ${e.message}`)));
  worker.on('exit', () => {
    alive--;
    const i = idle.indexOf(worker);
    if (i >= 0) idle.splice(i, 1);
    fail(new Error('Не удалось раскодировать HEIF: декодер остановился'));
    pump();
  });
  return worker;
}

function pump() {
  while (waiting.length) {
    let worker = idle.pop();
    if (!worker) {
      if (alive >= POOL_SIZE) return;
      worker = spawnWorker();
    }
    clearTimeout(worker.idleTimer);
    const task = waiting.shift();
    worker.task = task;
    worker.postMessage({ id: ++seq, buffer: task.buffer }, [task.buffer]);
  }
}

function decodePixels(fileBuffer) {
  // Копия в отдельный ArrayBuffer: её можно передать потоку без копирования.
  const buffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
  return new Promise((resolve, reject) => {
    waiting.push({ buffer, resolve, reject });
    pump();
  });
}

/** HEIC → PNG без сжатия, с EXIF и ICC исходника. Понимает sharp как обычный файл. */
async function heifToPng(filePath) {
  const file = await fs.promises.readFile(filePath);
  const meta = readHeifMetadata(file);
  const { width, height, alpha, data } = await decodePixels(file);
  let img = sharp(data, { raw: { width, height, channels: 4 } });
  if (!alpha) img = img.removeAlpha();
  const png = await img.png({ compressionLevel: 0, adaptiveFiltering: false }).toBuffer();
  const exif = meta.exif && meta.transformed ? resetOrientation(meta.exif) : meta.exif;
  return withPngMetadata(png, { icc: meta.icc, exif });
}

// Превью, оценка и конвертация одного файла идут подряд — не декодируем его трижды.
// Кэш ограничен и числом, и объёмом: кадр 48 Мп без сжатия весит около 150 МБ.
const CACHE_SIZE = 3;
const CACHE_BYTES = 256 * 1024 * 1024;
const cache = new Map(); // key → { promise, bytes }

function trimCache() {
  let bytes = 0;
  for (const e of cache.values()) bytes += e.bytes;
  for (const [key, e] of cache) {
    if (cache.size <= 1 || (cache.size <= CACHE_SIZE && bytes <= CACHE_BYTES)) break;
    cache.delete(key);
    bytes -= e.bytes;
  }
}

async function heifInput(filePath) {
  const st = await fs.promises.stat(filePath);
  const key = `${filePath}|${st.size}|${st.mtimeMs}`;
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key);
  } else {
    entry = { promise: heifToPng(filePath), bytes: 0 };
    entry.promise.then(
      (buf) => {
        entry.bytes = buf.length;
        trimCache();
      },
      () => cache.delete(key)
    );
  }
  cache.set(key, entry);
  trimCache();
  return entry.promise;
}

/** То, что можно передать в sharp: путь или раскодированный буфер. */
function imageInput(filePath) {
  return isHeifPath(filePath) ? heifInput(filePath) : Promise.resolve(filePath);
}

module.exports = { isHeifPath, imageInput, heifToPng, readHeifMetadata, resetOrientation, withPngMetadata, HEIF_EXT };
