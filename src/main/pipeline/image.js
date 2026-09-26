// src/main/pipeline/image.js
// Обработка изображений через sharp: ориентация, кроп, масштаб, варианты, кодирование.
const sharp = require('sharp');
const { encodeIco } = require('./ico');

// Файловый кэш sharp держит исходники открытыми — на Windows это блокирует
// перезапись файла «на месте». Кэш нам не нужен: каждый файл читается один раз.
sharp.cache(false);

const INPUT_OPTIONS = { failOn: 'error', limitInputPixels: 1e9 };

const EFFORT = {
  fast: { webp: 2, avif: 2, png: 6, gif: 3 },
  balanced: { webp: 4, avif: 4, png: 9, gif: 7 },
  max: { webp: 6, avif: 7, png: 9, gif: 10 }
};

const POSITIONS = {
  centre: 'centre',
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
  attention: sharp.strategy.attention,
  entropy: sharp.strategy.entropy
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

async function readMeta(input) {
  const m = await sharp(input, { ...INPUT_OPTIONS, animated: true }).metadata();
  const pages = m.pages || 1;
  return {
    format: m.format,
    width: m.width,
    height: m.pageHeight || m.height,
    pages,
    animated: pages > 1,
    loop: m.loop,
    delay: m.delay,
    orientation: m.orientation || 1,
    hasAlpha: Boolean(m.hasAlpha),
    density: m.density,
    isSvg: m.format === 'svg'
  };
}

// EXIF-ориентация 1–8 → [поворот, отражение] в семантике sharp: сначала flop, затем rotate.
// Таблица проверена эмпирически на sharp 0.32.
const ORIENTATION = { 1: [0, 0], 2: [0, 1], 3: [180, 0], 4: [180, 1], 5: [270, 1], 6: [90, 0], 7: [90, 1], 8: [270, 0] };

// (R₁·F^m₁)∘(R₂·F^m₂) = R₁₊₍±₂₎·F^(m₁⊕m₂): отражение меняет знак последующего поворота.
function compose([r1, m1], [r2, m2]) {
  return [(((r1 + (m1 ? -r2 : r2)) % 360) + 360) % 360, m1 ^ m2];
}

/**
 * Итоговая геометрия файла. Если метаданные удаляются, EXIF-ориентацию применяем всегда —
 * иначе фото с телефона останется на боку, а подсказки для просмотрщика уже не будет.
 */
function geometryFor(meta, settings, edit) {
  const autoOrient = settings.autoOrient || settings.metadata !== 'keep';
  const exif = autoOrient && meta.orientation > 1 ? ORIENTATION[meta.orientation] || [0, 0] : [0, 0];
  const fh = edit && edit.flipH ? 1 : 0;
  const fv = edit && edit.flipV ? 1 : 0;
  // flip (вертикаль) = поворот на 180° + flop
  const flips = fh && fv ? [180, 0] : fv ? [180, 1] : fh ? [0, 1] : [0, 0];
  const user = compose([(edit && edit.rotate) || 0, 0], flips);
  const [rotate, flop] = compose(user, exif);
  return { rotate, flop: Boolean(flop), exifApplied: exif[0] !== 0 || exif[1] !== 0 };
}

// Размер после EXIF-ориентации и ручного поворота.
function orientedSize(meta, settings, edit) {
  const { rotate } = geometryFor(meta, settings, edit);
  const quarter = rotate === 90 || rotate === 270;
  return quarter ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
}

function parseAspect(crop) {
  if (!crop || crop.aspect === 'none') return null;
  if (crop.aspect === 'custom') {
    const w = Number(crop.customW);
    const h = Number(crop.customH);
    return w > 0 && h > 0 ? w / h : null;
  }
  const [a, b] = String(crop.aspect).split(':').map(Number);
  return a > 0 && b > 0 ? a / b : null;
}

/**
 * Прямоугольник кадрирования в пикселях ориентированного изображения.
 * Ручной кроп (edit.crop, доли 0..1) приоритетнее пакетного соотношения сторон.
 */
function computeCrop(w, h, edit, cropSettings) {
  if (edit && edit.crop) {
    const c = edit.crop;
    const left = clamp(Math.round(c.x * w), 0, w - 1);
    const top = clamp(Math.round(c.y * h), 0, h - 1);
    const width = clamp(Math.round(c.w * w), 1, w - left);
    const height = clamp(Math.round(c.h * h), 1, h - top);
    if (width === w && height === h) return null;
    return { rect: { left, top, width, height } };
  }
  const aspect = parseAspect(cropSettings);
  if (!aspect) return null;
  let cw = w;
  let ch = Math.round(w / aspect);
  if (ch > h) {
    ch = h;
    cw = Math.round(h * aspect);
  }
  cw = clamp(cw, 1, w);
  ch = clamp(ch, 1, h);
  if (cw === w && ch === h) return null;
  const pos = cropSettings.position || 'centre';
  if (pos === 'attention' || pos === 'entropy') {
    return { smart: POSITIONS[pos], width: cw, height: ch };
  }
  let left = Math.round((w - cw) / 2);
  let top = Math.round((h - ch) / 2);
  if (pos === 'top') top = 0;
  if (pos === 'bottom') top = h - ch;
  if (pos === 'left') left = 0;
  if (pos === 'right') left = w - cw;
  return { rect: { left, top, width: cw, height: ch } };
}

/**
 * Параметры resize для sharp. factor — множитель варианта (@2x и т.п.),
 * variantWidth — абсолютная ширина варианта (для srcset).
 */
function computeResize(w, h, resize, { factor = 1, variantWidth = null } = {}) {
  const enlarge = Boolean(resize.enlarge);
  if (variantWidth) {
    return { width: Math.round(variantWidth), fit: 'inside', withoutEnlargement: !enlarge };
  }
  const f = factor;
  switch (resize.mode) {
    case 'percent': {
      const p = clamp(Number(resize.percent) || 100, 1, 1000) / 100;
      return { width: Math.max(1, Math.round(w * p * f)), height: Math.max(1, Math.round(h * p * f)), fit: 'fill' };
    }
    case 'width':
      return { width: Math.round(resize.width * f), fit: 'inside', withoutEnlargement: !enlarge };
    case 'height':
      return { height: Math.round(resize.height * f), fit: 'inside', withoutEnlargement: !enlarge };
    case 'longest': {
      const size = Math.round(resize.width * f);
      return { width: size, height: size, fit: 'inside', withoutEnlargement: !enlarge };
    }
    case 'box':
      return {
        width: Math.round(resize.width * f),
        height: Math.round(resize.height * f),
        fit: resize.fit || 'inside',
        position: POSITIONS[resize.position] || 'centre',
        withoutEnlargement: !enlarge
      };
    default:
      if (f !== 1) return { width: Math.max(1, Math.round(w * f)), height: Math.max(1, Math.round(h * f)), fit: 'fill' };
      return null;
  }
}

// Грубая оценка длинной стороны результата — нужна, чтобы растеризовать SVG в нужной плотности.
function estimateLongSide(w, h, r) {
  if (!r) return Math.max(w, h);
  if (r.width && r.height) return Math.max(r.width, r.height);
  if (r.width) return w >= h ? r.width : Math.round(r.width * (h / w));
  if (r.height) return h >= w ? r.height : Math.round(r.height * (w / h));
  return Math.max(w, h);
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return { r: 255, g: 255, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Собирает pipeline без кодировщика.
 * target — { id, alpha, animated } итогового формата.
 *
 * Вся геометрия (EXIF-ориентация, ручной поворот и отражения) сводится к одной паре
 * «отражение + поворот» и выполняется в одном проходе — так не теряются метаданные.
 */
async function buildPipeline(input, meta, settings, edit, target, variant = {}) {
  const wantAnimated = meta.animated && settings.keepAnimation && Boolean(target.animated);
  const geo = geometryFor(meta, settings, edit);
  if (wantAnimated && (geo.rotate === 90 || geo.rotate === 270)) {
    throw new Error('Поворот на 90° не поддерживается для анимации — отключите «Сохранять анимацию»');
  }

  // Рамка «Ш × В» сама задаёт пропорции, поэтому обрезка по пропорциям с ней не сочетается
  // (в интерфейсе её в этом режиме и не видно).
  const cropOpts = settings.resize?.mode === 'box' ? { ...settings.crop, aspect: 'none' } : settings.crop;

  // «Логические» размеры — в пикселях исходника (для SVG — при 72 dpi).
  const logical = orientedSize(meta, settings, edit);
  const logicalCrop = computeCrop(logical.width, logical.height, edit, cropOpts);
  const cropSize = (c, fw, fh) => (c ? (c.rect ? { width: c.rect.width, height: c.rect.height } : { width: c.width, height: c.height }) : { width: fw, height: fh });
  const lBase = cropSize(logicalCrop, logical.width, logical.height);
  let resize = computeResize(lBase.width, lBase.height, settings.resize, variant);

  const inputOpts = { ...INPUT_OPTIONS, animated: wantAnimated };
  let k = 1;
  if (meta.isSvg) {
    // SVG растеризуем сразу в целевом разрешении, иначе апскейл будет мыльным.
    const scale = estimateLongSide(lBase.width, lBase.height, resize) / Math.max(1, lBase.width, lBase.height);
    if (scale > 1) {
      const base = meta.density || 72;
      inputOpts.density = clamp(Math.round(base * scale), 1, 100000);
      k = inputOpts.density / base;
    }
  }

  const applyGeometry = (pipeline) => {
    let p = pipeline;
    if (geo.flop) p = p.flop();
    if (geo.rotate) p = p.rotate(geo.rotate);
    return p;
  };

  let dims = { width: Math.round(logical.width * k), height: Math.round(logical.height * k) };
  let crop = k !== 1 ? computeCrop(dims.width, dims.height, edit, cropOpts) : logicalCrop;

  // Обрезка полей: пробный проход только для поиска границ, сам результат
  // строится обычным кропом из исходника — с метаданными.
  const useTrim = settings.trim && !(edit && edit.crop) && !wantAnimated;
  let trimRect = null;
  if (useTrim) {
    const { info } = await applyGeometry(sharp(input, inputOpts)).trim({ threshold: 10 }).raw().toBuffer({ resolveWithObject: true });
    const left = Math.max(0, -(info.trimOffsetLeft || 0));
    const top = Math.max(0, -(info.trimOffsetTop || 0));
    if (info.width < dims.width || info.height < dims.height) {
      trimRect = { left, top, width: Math.min(info.width, dims.width - left), height: Math.min(info.height, dims.height - top) };
      dims = { width: trimRect.width, height: trimRect.height };
      crop = computeCrop(dims.width, dims.height, edit, cropOpts);
      const cs = cropSize(crop, dims.width, dims.height);
      resize = computeResize(cs.width / k, cs.height / k, settings.resize, variant);
    }
  }

  let img = applyGeometry(sharp(input, inputOpts));

  // Один extract: кроп внутри обрезанных полей.
  let rect = crop && crop.rect ? { ...crop.rect } : null;
  if (trimRect) {
    rect = rect ? { ...rect, left: rect.left + trimRect.left, top: rect.top + trimRect.top } : trimRect;
  }
  if (rect) img = img.extract(rect);

  const kernel = settings.pixelArt ? sharp.kernel.nearest : sharp.kernel.lanczos3;
  const bg = hexToRgb(settings.background);

  if (crop && crop.smart) {
    if (trimRect && !rect) img = img.extract(trimRect);
    // Умный кроп и масштаб в одном resize: sharp сам найдёт важную область.
    const scaled = resize ? computeSmartTarget(crop.width, crop.height, resize) : { width: crop.width, height: crop.height };
    img = img.resize({ width: scaled.width, height: scaled.height, fit: 'cover', position: crop.smart, kernel });
  } else if (resize) {
    img = img.resize({ ...resize, kernel, background: { ...bg, alpha: target.alpha ? 0 : 1 } });
  }

  if (settings.sharpen && resize) img = img.sharpen({ sigma: 0.5 });
  if (settings.grayscale) img = img.grayscale();
  if (!target.alpha) img = img.flatten({ background: bg });

  if (settings.metadata === 'keep') {
    const opts = {};
    // Ориентация уже применена к пикселям — тег сбрасываем, иначе просмотрщик повернёт ещё раз.
    if (geo.exifApplied) opts.orientation = 1;
    if (meta.density && !meta.isSvg) opts.density = meta.density;
    img = img.withMetadata(opts);
  }

  return { img, animated: wantAnimated };
}

// Для умного кропа: целевой размер с сохранением соотношения сторон кропа.
function computeSmartTarget(cw, ch, r) {
  const ratio = cw / ch;
  let width = cw;
  let height = ch;
  if (r.fit === 'fill' && r.width && r.height) {
    width = r.width;
    height = r.height;
  } else if (r.width && r.height) {
    const k = Math.min(r.width / cw, r.height / ch);
    width = cw * k;
    height = ch * k;
  } else if (r.width) {
    width = r.width;
    height = r.width / ratio;
  } else if (r.height) {
    height = r.height;
    width = r.height * ratio;
  }
  if (r.withoutEnlargement && width > cw) {
    width = cw;
    height = ch;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

function applyEncoder(img, targetId, settings, meta, animated) {
  const q = clamp(Math.round(Number(settings.quality) || 80), 1, 100);
  const effort = EFFORT[settings.effort] || EFFORT.balanced;
  switch (targetId) {
    case 'jpg':
      return img.jpeg({
        quality: q,
        mozjpeg: settings.effort !== 'fast',
        progressive: settings.progressive,
        chromaSubsampling: q >= 90 ? '4:4:4' : '4:2:0'
      });
    case 'png':
      return settings.pngPalette
        ? img.png({ palette: true, quality: q, colours: clamp(settings.colors, 2, 256), effort: 10, compressionLevel: effort.png })
        : img.png({ compressionLevel: effort.png, adaptiveFiltering: true, progressive: false });
    case 'webp':
      return img.webp({
        quality: q,
        lossless: settings.lossless,
        alphaQuality: 100,
        effort: effort.webp,
        smartSubsample: q >= 80,
        loop: animated ? meta.loop || 0 : undefined
      });
    case 'avif':
      return img.avif({ quality: q, lossless: settings.lossless, effort: effort.avif, chromaSubsampling: q >= 90 ? '4:4:4' : '4:2:0' });
    case 'tiff':
      return img.tiff({ compression: 'lzw', predictor: 'horizontal' });
    case 'gif':
      return img.gif({ colours: clamp(settings.colors, 2, 256), effort: effort.gif, dither: 1, loop: animated ? meta.loop || 0 : undefined });
    default:
      throw new Error(`Формат ${targetId} не поддерживается для изображений`);
  }
}

/**
 * Полный цикл для одного варианта: возвращает буфер и размеры результата.
 */
async function renderImage(input, meta, settings, edit, target, variant = {}) {
  if (target.id === 'ico') {
    const { img } = await buildPipeline(input, meta, { ...settings, keepAnimation: false }, edit, { id: 'png', alpha: true }, variant);
    const master = await img.png().toBuffer();
    const sizes = (settings.icoSizes || []).filter((s) => s >= 16 && s <= 256);
    const buffer = await encodeIco(master, sizes.length ? sizes : [16, 32, 48, 256]);
    const max = Math.max(...(sizes.length ? sizes : [256]));
    return { buffer, width: max, height: max };
  }
  const { img, animated } = await buildPipeline(input, meta, settings, edit, target, variant);
  const { data, info } = await applyEncoder(img, target.id, settings, meta, animated).toBuffer({ resolveWithObject: true });
  const height = animated && meta.pages > 1 ? Math.round(info.height / meta.pages) : info.height;
  return { buffer: data, width: info.width, height };
}

module.exports = { readMeta, renderImage, orientedSize, geometryFor, computeCrop, computeResize, INPUT_OPTIONS };
