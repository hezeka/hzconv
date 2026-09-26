// src/main/formats.js
// Реестр форматов и нормализация настроек. Источник правды — src/shared/*.json,
// те же файлы импортирует интерфейс.
const path = require('path');
const formats = require('../shared/formats.json');
const defaults = require('../shared/defaults.json');

const inputByExt = new Map();
for (const [type, exts] of Object.entries(formats.input)) {
  for (const ext of exts) inputByExt.set(ext, type);
}

function extOf(filePath) {
  return path.extname(filePath).slice(1).toLowerCase();
}

function getFileType(filePath) {
  return inputByExt.get(extOf(filePath)) || null;
}

function getOutputFormat(type, id) {
  return formats.output[type]?.find((f) => f.id === id) || null;
}

// Для «Исходного» формата подбираем тот же контейнер, что у файла.
const ORIGINAL_MAP = {
  image: { jpg: 'jpg', jpeg: 'jpg', jpe: 'jpg', jfif: 'jpg', png: 'png', webp: 'webp', avif: 'avif', tif: 'tiff', tiff: 'tiff', gif: 'gif', svg: 'png' },
  video: { mp4: 'mp4', m4v: 'mp4', mov: 'mov', mkv: 'mkv', webm: 'webm', avi: 'avi' },
  audio: { mp3: 'mp3', m4a: 'm4a', aac: 'm4a', ogg: 'ogg', oga: 'ogg', opus: 'opus', flac: 'flac', wav: 'wav', aif: 'wav', aiff: 'wav' }
};
const ORIGINAL_FALLBACK = { image: 'png', video: 'mp4', audio: 'mp3' };

/**
 * Возвращает итоговый формат для файла с учётом «Исходного».
 * ext — расширение результата. Для «Исходного» сохраняем написание исходника (jpeg остаётся jpeg).
 */
function resolveTarget(filePath, type, formatId) {
  const srcExt = extOf(filePath);
  if (!formatId || formatId === 'original') {
    const id = ORIGINAL_MAP[type]?.[srcExt] || ORIGINAL_FALLBACK[type];
    const keepExt = ORIGINAL_MAP[type]?.[srcExt] && srcExt !== 'aif' && srcExt !== 'aiff' && srcExt !== 'aac' && srcExt !== 'svg';
    return { id, ext: keepExt ? srcExt : getOutputFormat(type, id).ext };
  }
  const fmt = getOutputFormat(type, formatId);
  if (!fmt) throw new Error(`Неизвестный формат: ${formatId}`);
  return { id: fmt.id, ext: fmt.ext };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Глубокое слияние с дефолтами: лишние ключи отбрасываются, типы проверяются.
function mergeDefaults(def, value) {
  if (!isPlainObject(def)) {
    if (value === undefined || value === null) return def;
    if (Array.isArray(def)) return Array.isArray(value) ? value : def;
    return typeof value === typeof def ? value : def;
  }
  const out = {};
  const src = isPlainObject(value) ? value : {};
  for (const key of Object.keys(def)) out[key] = mergeDefaults(def[key], src[key]);
  return out;
}

function normalizeSettings(settings) {
  return mergeDefaults(defaults, settings);
}

module.exports = {
  formats,
  defaults,
  extOf,
  getFileType,
  getOutputFormat,
  resolveTarget,
  normalizeSettings
};
