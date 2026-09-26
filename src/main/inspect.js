// src/main/inspect.js
// Сведения о файлах и превью для интерфейса.
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const { getFileType, extOf } = require('./formats');
const { readMeta, INPUT_OPTIONS } = require('./pipeline/image');
const { imageInput, isHeifPath } = require('./pipeline/heif');
const { probeMedia } = require('./pipeline/media');
const { runToBuffer } = require('./ffmpeg');

// Ограничитель параллельности: превью не должны забивать диск и CPU при импорте тысяч файлов.
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

const limit = createLimiter(4);

class LruCache {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

const detailsCache = new LruCache(2000);

const toDataUrl = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

/** Быстро: только stat. Вызывается при добавлении файлов. */
async function inspect(paths) {
  return Promise.all(
    paths.map(async (p) => {
      const type = getFileType(p);
      try {
        const st = await fs.stat(p);
        return { path: p, name: path.basename(p), ext: extOf(p), type, size: st.size, mtime: st.mtimeMs, ok: Boolean(type) };
      } catch {
        return { path: p, name: path.basename(p), ext: extOf(p), type, size: 0, mtime: 0, ok: false, error: 'Файл недоступен' };
      }
    })
  );
}

async function imageThumb(filePath, size) {
  const buf = await sharp(await imageInput(filePath), { ...INPUT_OPTIONS, pages: 1 })
    .rotate()
    .resize(size, size, { fit: 'cover', position: 'attention' })
    .flatten({ background: '#1a1a1d' })
    .webp({ quality: 72 })
    .toBuffer();
  return toDataUrl(buf, 'image/webp');
}

async function frameThumb(filePath, atSeconds, size) {
  const buf = await runToBuffer([
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(Math.max(0, atSeconds)),
    '-i', filePath,
    '-frames:v', '1',
    '-vf', `scale=w='if(gte(iw,ih),-2,${size})':h='if(gte(iw,ih),${size},-2)'`,
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1'
  ]);
  return toDataUrl(buf, 'image/jpeg');
}

async function coverThumb(filePath, size) {
  const buf = await runToBuffer([
    '-hide_banner', '-loglevel', 'error', '-i', filePath, '-an', '-map', '0:v:0', '-frames:v', '1',
    '-vf', `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}`,
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1'
  ]);
  return toDataUrl(buf, 'image/jpeg');
}

/** Размеры, длительность и миниатюра. Кэшируется по пути и времени изменения. */
async function details(filePath, { thumbSize = 112 } = {}) {
  const st = await fs.stat(filePath);
  const key = `${filePath}|${st.mtimeMs}|${st.size}|${thumbSize}`;
  const cached = detailsCache.get(key);
  if (cached) return cached;

  const result = await limit(async () => {
    const type = getFileType(filePath);
    const info = { type, size: st.size };
    if (type === 'image') {
      const m = await readMeta(await imageInput(filePath));
      const swap = m.orientation >= 5;
      Object.assign(info, {
        width: swap ? m.height : m.width,
        height: swap ? m.width : m.height,
        frames: m.pages,
        animated: m.animated,
        hasAlpha: m.hasAlpha,
        format: isHeifPath(filePath) ? 'heif' : m.format
      });
      info.thumb = await imageThumb(filePath, thumbSize).catch(() => null);
    } else if (type === 'video') {
      const m = await probeMedia(filePath);
      Object.assign(info, { width: m.width, height: m.height, duration: m.duration, fps: m.fps, hasAudio: m.hasAudio, codec: m.videoCodec });
      info.thumb = await frameThumb(filePath, Math.min(1, (m.duration || 0) * 0.1), thumbSize * 2).catch(() => null);
    } else if (type === 'audio') {
      const m = await probeMedia(filePath);
      Object.assign(info, { duration: m.duration, sampleRate: m.sampleRate, channels: m.channels, codec: m.audioCodec, bitrate: m.bitrate });
      info.thumb = m.hasCover ? await coverThumb(filePath, thumbSize).catch(() => null) : null;
    }
    return info;
  });

  detailsCache.set(key, result);
  return result;
}

/**
 * Превью для редактора кадрирования: изображение (или кадр видео) с применёнными
 * EXIF-ориентацией, поворотом и отражением — в той же семантике, что и конвертация.
 */
async function preview(filePath, { edit = {}, maxSize = 1600, time = null, autoOrient = true } = {}) {
  const type = getFileType(filePath);
  const quarter = edit.rotate === 90 || edit.rotate === 270;
  let full;
  let small;

  if (type === 'image') {
    const input = await imageInput(filePath);
    const m = await readMeta(input);
    full = autoOrient && m.orientation >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
    let img = sharp(input, { ...INPUT_OPTIONS, pages: 1 });
    if (autoOrient) img = img.rotate();
    small = await img.resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  } else if (type === 'video') {
    const m = await probeMedia(filePath);
    const at = time ?? Math.min(1, (m.duration || 0) * 0.1);
    const frame = await runToBuffer(['-hide_banner', '-loglevel', 'error', '-ss', String(at), '-i', filePath, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
    full = { width: m.width, height: m.height };
    small = await sharp(frame).resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  } else {
    throw new Error('Превью доступно только для изображений и видео');
  }

  // Поворот и отражение — отдельным pipeline, в той же семантике, что и конвертация.
  let out = sharp(small.data, { raw: { width: small.info.width, height: small.info.height, channels: small.info.channels } });
  if (edit.flipH) out = out.flop();
  if (edit.flipV) out = out.flip();
  if (edit.rotate) out = out.rotate(edit.rotate);
  const buf = await out.png({ compressionLevel: 2 }).toBuffer();
  if (quarter) full = { width: full.height, height: full.width };
  return { dataUrl: toDataUrl(buf, 'image/png'), width: full.width, height: full.height };
}

module.exports = { inspect, details, preview, createLimiter, toDataUrl };
