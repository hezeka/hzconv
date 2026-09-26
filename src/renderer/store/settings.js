import { nextTick, reactive, watch, ref } from 'vue';
import defaults from '../../shared/defaults.json';

const KEY = 'hzconv.settings.v2';
const PRESETS_KEY = 'hzconv.presets.v1';
const LEGACY_KEY = 'conversionForm_settings';

const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Накладывает значения на дефолты, отбрасывая мусор и неверные типы. */
export function mergeDefaults(def, value) {
  if (!isObj(def)) {
    if (value === undefined || value === null) return clone(def);
    if (Array.isArray(def)) return Array.isArray(value) ? clone(value) : clone(def);
    return typeof value === typeof def ? value : def;
  }
  const out = {};
  const src = isObj(value) ? value : {};
  for (const key of Object.keys(def)) out[key] = mergeDefaults(def[key], src[key]);
  return out;
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Настройки прошлой версии (одна форма «формат/качество/папка») → профиль v2.
 * Используется и для штучного режима, и для переноса пакетной формы в задание.
 */
export function legacyToSettings(legacy) {
  const s = clone(defaults);
  const q = legacy.quality;
  s.image.quality = q === 'low' ? 65 : q === 'high' ? 90 : 80;
  s.video.quality = q === 'low' ? 'compact' : q === 'high' ? 'high' : 'balanced';
  s.audio.bitrate = q === 'low' ? 128 : q === 'high' ? 320 : 192;
  const loc = { original: 'source', subdir: 'subdir', custom: 'custom' }[legacy.saveOption];
  if (loc) s.output.location = loc;
  if (legacy.subDir) s.output.subDir = legacy.subDir;
  if (legacy.outputDir) s.output.customDir = legacy.outputDir;
  if (legacy.prefix) s.output.template = `${legacy.prefix}{name}`;
  if (['overwrite', 'rename', 'skip'].includes(legacy.overwritePolicy)) s.output.conflict = legacy.overwritePolicy;
  if (typeof legacy.preserveSubfolders === 'boolean') s.output.preserveStructure = legacy.preserveSubfolders;
  const f = String(legacy.format || '').toLowerCase();
  const map = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', tiff: 'tiff', gif: 'gif' };
  if (map[f]) s.image.format = map[f];
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(f)) s.video.format = f;
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(f)) s.audio.format = f;
  return s;
}

function migrateLegacy() {
  const legacy = read(LEGACY_KEY);
  if (!legacy) return null;
  localStorage.removeItem(LEGACY_KEY);
  return legacyToSettings(legacy);
}

// Активный профиль: штучный режим или выбранное пакетное задание.
// Компоненты работают с одним объектом settings, а профили подменяют его содержимое.
export const settings = reactive(mergeDefaults(defaults, read(KEY) || migrateLegacy()));

const saveSingle = (data) => localStorage.setItem(KEY, JSON.stringify(data));
let persist = saveSingle;
let saveTimer = null;
let suspended = false;

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    persist(clone(settings));
  } catch {
    /* переполненное хранилище — не критично */
  }
}

watch(
  settings,
  () => {
    if (suspended) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  },
  { deep: true }
);

function replaceInPlace(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (isObj(v) && isObj(target[k])) replaceInPlace(target[k], v);
    else target[k] = v;
  }
}

/** Подменяет активный профиль. save вызывается при каждом изменении настроек. */
export function bindProfile(data, save) {
  if (saveTimer) flush();
  suspended = true;
  // Обновляем на месте: компоненты держат ссылки вида settings.image.
  replaceInPlace(settings, mergeDefaults(defaults, data));
  persist = save;
  nextTick(() => {
    suspended = false;
  });
}

export function bindSingle() {
  if (persist === saveSingle) return;
  bindProfile(read(KEY) || {}, saveSingle);
}

export function resetSection(section) {
  Object.assign(settings[section], clone(defaults[section]));
}

// ——— Пресеты ———

export const builtinPresets = [
  {
    id: 'web',
    group: 'Изображения',
    name: 'Для сайта',
    hint: 'WebP, длинная сторона до 1920 px',
    patch: { image: { format: 'webp', quality: 80, resize: { mode: 'longest', width: 1920 } } }
  },
  {
    id: 'srcset',
    group: 'Изображения',
    name: 'Набор для srcset',
    hint: 'WebP шириной 480, 960, 1440 и 1920 px',
    patch: {
      image: {
        format: 'webp',
        quality: 78,
        variants: {
          enabled: true,
          items: [
            { kind: 'w', value: 480, suffix: '-480w' },
            { kind: 'w', value: 960, suffix: '-960w' },
            { kind: 'w', value: 1440, suffix: '-1440w' },
            { kind: 'w', value: 1920, suffix: '-1920w' }
          ]
        }
      }
    }
  },
  {
    id: 'retina',
    group: 'Изображения',
    name: 'Иконки @1x @2x @3x',
    hint: 'PNG, базовая ширина 64 px — удобно для SVG',
    patch: {
      image: {
        format: 'png',
        resize: { mode: 'width', width: 64, enlarge: true },
        variants: {
          enabled: true,
          items: [
            { kind: 'x', value: 1, suffix: '@1x' },
            { kind: 'x', value: 2, suffix: '@2x' },
            { kind: 'x', value: 3, suffix: '@3x' }
          ]
        }
      }
    }
  },
  {
    id: 'favicon',
    group: 'Изображения',
    name: 'Favicon',
    hint: 'ICO с размерами 16–256 px',
    patch: { image: { format: 'ico', icoSizes: [16, 32, 48, 64, 128, 256] } }
  },
  {
    id: 'square',
    group: 'Изображения',
    name: 'Квадрат для соцсетей',
    hint: 'JPG 1080 × 1080, умный кроп по главному объекту',
    patch: {
      image: {
        format: 'jpg',
        quality: 88,
        crop: { aspect: '1:1', position: 'attention' },
        resize: { mode: 'box', width: 1080, height: 1080, fit: 'cover', enlarge: false }
      }
    }
  },
  {
    id: 'lossless',
    group: 'Изображения',
    name: 'PNG без потерь',
    hint: 'Максимальное сжатие, метаданные удаляются',
    patch: { image: { format: 'png', effort: 'max', metadata: 'strip' } }
  },
  {
    id: 'video-web',
    group: 'Видео',
    name: 'Видео для сайта',
    hint: 'MP4 H.264, 1080p, быстрый старт',
    patch: { video: { format: 'mp4', codec: 'h264', quality: 'balanced', resolution: '1080' } }
  },
  {
    id: 'video-small',
    group: 'Видео',
    name: 'Компактное видео',
    hint: 'WebM VP9, 720p',
    patch: { video: { format: 'webm', quality: 'compact', resolution: '720' } }
  },
  {
    id: 'gif',
    group: 'Видео',
    name: 'GIF из видео',
    hint: '480 px, 15 кадров/с',
    patch: { video: { format: 'gif', gifWidth: 480, gifFps: 15 } }
  },
  {
    id: 'extract-audio',
    group: 'Видео',
    name: 'Извлечь звук',
    hint: 'MP3 192 кбит/с из видео',
    patch: { video: { format: 'mp3', audioBitrate: 192 } }
  },
  {
    id: 'podcast',
    group: 'Аудио',
    name: 'Голос и подкасты',
    hint: 'MP3 128 кбит/с, моно, выравнивание громкости',
    patch: { audio: { format: 'mp3', bitrate: 128, channels: '1', normalize: true } }
  },
  {
    id: 'master',
    group: 'Аудио',
    name: 'Без потерь',
    hint: 'FLAC',
    patch: { audio: { format: 'flac' } }
  }
];

export const userPresets = ref(read(PRESETS_KEY) || []);

watch(
  userPresets,
  (v) => {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(v));
    } catch {
      /* не критично */
    }
  },
  { deep: true }
);

function deepAssign(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (isObj(v) && isObj(target[k])) deepAssign(target[k], v);
    else target[k] = clone(v);
  }
}

/** Встроенный пресет сбрасывает затронутый раздел к дефолтам и накладывает изменения. */
export function applyPreset(preset) {
  for (const [section, patch] of Object.entries(preset.patch)) {
    if (!preset.user) Object.assign(settings[section], clone(defaults[section]));
    deepAssign(settings[section], patch);
  }
}

export function saveUserPreset(name, sections) {
  const patch = {};
  for (const s of sections) patch[s] = clone(settings[s]);
  const preset = { id: `u-${Date.now().toString(36)}`, name: name.trim(), user: true, patch };
  userPresets.value = [...userPresets.value.filter((p) => p.name !== preset.name), preset];
  return preset;
}

export function deleteUserPreset(id) {
  userPresets.value = userPresets.value.filter((p) => p.id !== id);
}
