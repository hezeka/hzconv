// src/main/pipeline/media.js
// Видео и аудио через ffmpeg: перекодирование, извлечение звука, GIF, GIF → видео.
const { ffmpeg, ensureFfmpeg, probe, lastErrorLine } = require('../ffmpeg');

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const even = (n) => Math.max(2, 2 * Math.round(Number(n) / 2));

class CancelError extends Error {
  constructor() {
    super('Отменено');
    this.cancelled = true;
  }
}

/** «90», «1:30», «01:02:03.5» → секунды. Пустая строка → null. */
function parseTime(value) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!s) return null;
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s)) throw new Error(`Неверный формат времени: «${s}». Используйте 90, 1:30 или 01:02:03`);
  return s.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
}

/** Поворот при показе, кратный 90°: матрица −90° (телефон держали вертикально) → 90. */
function streamRotation(stream) {
  const deg = stream.rotation ? -stream.rotation : 0;
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
}

/** Сводка по разобранному выводу ffmpeg: размеры с учётом поворота, звук, обложка. */
function summarizeProbe(data) {
  const video = data.streams.find((s) => s.type === 'video' && !s.cover);
  const cover = data.streams.find((s) => s.type === 'video' && s.cover);
  const audio = data.streams.find((s) => s.type === 'audio');
  const rotation = video ? streamRotation(video) : 0;
  let width = video?.width || 0;
  let height = video?.height || 0;
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  return {
    duration: data.duration,
    width,
    height,
    fps: video?.fps || null,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    hasCover: Boolean(cover),
    videoCodec: video?.codec || null,
    audioCodec: audio?.codec || null,
    sampleRate: audio?.sampleRate || null,
    channels: audio?.channels || null,
    bitrate: data.bitrate
  };
}

async function probeMedia(filePath) {
  return summarizeProbe(await probe(filePath));
}

// ——— Геометрия ———

function geometryFilters(edit, cropAspect) {
  const f = [];
  if (edit?.flipH) f.push('hflip');
  if (edit?.flipV) f.push('vflip');
  if (edit?.rotate === 90) f.push('transpose=clock');
  if (edit?.rotate === 180) f.push('hflip', 'vflip');
  if (edit?.rotate === 270) f.push('transpose=cclock');
  if (edit?.crop) {
    const { x, y, w, h } = edit.crop;
    const n = (v) => clamp(Number(v) || 0, 0, 1).toFixed(6);
    f.push(`crop=w='2*trunc(iw*${n(w)}/2)':h='2*trunc(ih*${n(h)}/2)':x='trunc(iw*${n(x)})':y='trunc(ih*${n(y)})'`);
  } else if (cropAspect) {
    const a = cropAspect.toFixed(6);
    f.push(`crop=w='2*trunc(min(iw,ih*${a})/2)':h='2*trunc(min(ih,iw/${a})/2)'`);
  }
  return f;
}

function aspectFromString(s) {
  if (!s || s === 'none') return null;
  const [a, b] = String(s).split(':').map(Number);
  return a > 0 && b > 0 ? a / b : null;
}

function videoScaleFilter(v) {
  if (v.resolution === 'custom') {
    return `scale=w=${even(v.customWidth)}:h=${even(v.customHeight)}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`;
  }
  const n = Number(v.resolution);
  if (!n) return null;
  // Пресет задаёт короткую сторону и не увеличивает видео.
  return `scale=w='if(gte(iw,ih),-2,min(${n},iw))':h='if(gte(iw,ih),min(${n},ih),-2)':flags=lanczos`;
}

function imageResizeToScale(r) {
  switch (r.mode) {
    case 'percent':
      return `scale=w='2*trunc(iw*${clamp(r.percent, 1, 1000) / 100}/2)':h=-2:flags=lanczos`;
    case 'width':
      return `scale=w=${even(r.width)}:h=-2:flags=lanczos`;
    case 'height':
      return `scale=w=-2:h=${even(r.height)}:flags=lanczos`;
    case 'longest':
      return `scale=w='if(gte(iw,ih),${even(r.width)},-2)':h='if(gte(iw,ih),-2,${even(r.width)})':flags=lanczos`;
    case 'box':
      return `scale=w=${even(r.width)}:h=${even(r.height)}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`;
    default:
      return null;
  }
}

// ——— Кодеки ———

const CRF = {
  h264: { max: 16, high: 19, balanced: 23, compact: 28 },
  h265: { max: 20, high: 23, balanced: 27, compact: 31 },
  vp9: { max: 20, high: 28, balanced: 33, compact: 38 }
};
const MPEG4_Q = { max: 2, high: 3, balanced: 5, compact: 8 };
const X26X_PRESET = { fast: 'veryfast', balanced: 'medium', max: 'slow' };
const VP9_CPU = { fast: 5, balanced: 3, max: 1 };
const MUXER = { mp4: 'mp4', mov: 'mov', mkv: 'matroska', webm: 'webm', avi: 'avi', gif: 'gif', mp3: 'mp3', m4a: 'ipod', ogg: 'ogg', opus: 'opus', flac: 'flac', wav: 'wav' };

function videoCodecArgs(targetId, codec, quality, speed) {
  const even2 = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  if (targetId === 'webm') {
    return { filters: [even2], args: ['-c:v', 'libvpx-vp9', '-crf', String(CRF.vp9[quality] ?? 33), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', String(VP9_CPU[speed] ?? 3), '-pix_fmt', 'yuv420p'] };
  }
  if (targetId === 'avi') {
    return { filters: [even2], args: ['-c:v', 'mpeg4', '-q:v', String(MPEG4_Q[quality] ?? 5), '-pix_fmt', 'yuv420p'] };
  }
  const preset = X26X_PRESET[speed] || 'medium';
  if (codec === 'h265') {
    const args = ['-c:v', 'libx265', '-crf', String(CRF.h265[quality] ?? 27), '-preset', preset, '-x265-params', 'log-level=error', '-pix_fmt', 'yuv420p'];
    if (targetId === 'mp4' || targetId === 'mov') args.push('-tag:v', 'hvc1');
    return { filters: [even2], args };
  }
  return { filters: [even2], args: ['-c:v', 'libx264', '-crf', String(CRF.h264[quality] ?? 23), '-preset', preset, '-pix_fmt', 'yuv420p'] };
}

function audioCodecArgs(targetId, { bitrate, sampleRate, channels, normalize }, info) {
  const kbps = `${clamp(Math.round(Number(bitrate) || 192), 32, 512)}k`;
  const args = [];
  switch (targetId) {
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', kbps, '-id3v2_version', '3');
      break;
    case 'm4a':
    case 'mp4':
    case 'mov':
    case 'mkv':
      args.push('-c:a', 'aac', '-b:a', kbps);
      break;
    case 'ogg':
      args.push('-c:a', 'libvorbis', '-b:a', kbps);
      break;
    case 'opus':
    case 'webm':
      args.push('-c:a', 'libopus', '-b:a', kbps);
      break;
    case 'avi':
      args.push('-c:a', 'libmp3lame', '-b:a', kbps);
      break;
    case 'flac':
      args.push('-c:a', 'flac', '-compression_level', '8');
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
    default:
      throw new Error(`Формат ${targetId} не поддерживается для звука`);
  }
  let rate = sampleRate && sampleRate !== 'original' ? Number(sampleRate) : null;
  if (normalize) {
    args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
    // loudnorm на выходе даёт 192 кГц — возвращаем исходную частоту.
    if (!rate) rate = info?.sampleRate || 48000;
  }
  if (targetId === 'opus' || targetId === 'webm') {
    // libopus работает только с 8/12/16/24/48 кГц.
    if (rate && ![8000, 12000, 16000, 24000, 48000].includes(rate)) rate = 48000;
  }
  if (rate) args.push('-ar', String(rate));
  if (channels && channels !== 'original') args.push('-ac', String(channels));
  return args;
}

// Обрезка задаётся на входе: ffmpeg не читает лишнее и честно получает конец потока
// (это важно для палитры GIF, которая формируется только в конце входа).
function trimArgs(start, end, duration) {
  const input = [];
  if (start !== null && start > 0) input.push('-ss', start.toFixed(3));
  if (end !== null) {
    const len = end - (start || 0);
    if (len <= 0) throw new Error('Конец фрагмента должен быть позже начала');
    input.push('-t', len.toFixed(3));
  }
  const total = Math.max(0.001, (end ?? duration ?? 0) - (start || 0));
  return { input, total: duration || end ? total : 0 };
}

const single = (input, output, format, total) => ({
  total,
  passes: [{ inputs: [{ ref: 'source', options: input }], output, format, out: 'final', weight: 1 }]
});

/**
 * Собирает проходы ffmpeg. kind: 'video' | 'audio' | 'gif-image'.
 * Обычно проход один; GIF кодируется в два (палитра → кадры), чтобы не держать видео в памяти.
 */
function buildArgs({ kind, targetId, settings, edit, info }) {
  const input = [];
  const output = [];

  if (kind === 'gif-image') {
    const img = settings.image;
    const q = clamp(Number(img.quality) || 80, 1, 100);
    const filters = [...geometryFilters(edit, null), imageResizeToScale(img.resize), 'scale=trunc(iw/2)*2:trunc(ih/2)*2'].filter(Boolean);
    output.push('-vf', filters.join(','), '-an', '-map', '0:v:0');
    if (targetId === 'webm') {
      output.push('-c:v', 'libvpx-vp9', '-crf', String(Math.round(clamp(50 - q * 0.25, 15, 45))), '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p');
    } else {
      output.push('-c:v', 'libx264', '-crf', String(Math.round(clamp(40 - q * 0.22, 16, 36))), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    }
    return single(input, output, MUXER[targetId], info?.duration || 0);
  }

  if (kind === 'audio') {
    const a = settings.audio;
    const t = trimArgs(parseTime(a.trimStart), parseTime(a.trimEnd), info?.duration);
    input.push(...t.input);
    output.push('-map', '0:a:0');
    const keepCover = targetId === 'mp3' && info?.hasCover;
    if (keepCover) output.push('-map', '0:v:0', '-c:v', 'copy', '-disposition:v', 'attached_pic');
    else output.push('-vn');
    output.push(...audioCodecArgs(targetId, a, info));
    if (targetId === 'm4a') output.push('-movflags', '+faststart');
    return single(input, output, MUXER[targetId], t.total);
  }

  // kind === 'video'
  const v = settings.video;
  const t = trimArgs(parseTime(v.trimStart), parseTime(v.trimEnd), info?.duration);
  input.push(...t.input);

  const geometry = geometryFilters(edit, aspectFromString(v.cropAspect));

  if (targetId === 'gif') {
    const fps = clamp(Number(v.gifFps) || 15, 1, 50);
    const w = Number(v.gifWidth);
    const chain = [...geometry, `fps=${fps}`];
    if (w > 0) chain.push(`scale=w='min(${Math.round(w)},iw)':h=-1:flags=lanczos`);
    const vf = chain.join(',');
    return {
      total: t.total,
      passes: [
        {
          inputs: [{ ref: 'source', options: input }],
          output: ['-vf', `${vf},palettegen=stats_mode=diff`, '-an', '-frames:v', '1', '-update', '1'],
          format: 'image2',
          out: 'palette',
          weight: 0.3
        },
        {
          inputs: [
            { ref: 'source', options: input },
            { ref: 'palette', options: [] }
          ],
          output: ['-lavfi', `[0:v]${vf}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, '-an', '-loop', '0'],
          format: 'gif',
          out: 'final',
          weight: 0.7
        }
      ]
    };
  }

  if (['mp3', 'm4a', 'wav'].includes(targetId)) {
    if (!info?.hasAudio) throw new Error('В видео нет звуковой дорожки');
    output.push('-map', '0:a:0', '-vn', ...audioCodecArgs(targetId, { bitrate: v.audioBitrate }, info));
    if (targetId === 'm4a') output.push('-movflags', '+faststart');
    return single(input, output, MUXER[targetId], t.total);
  }

  const scale = videoScaleFilter(v);
  const fps = v.fps && v.fps !== 'original' ? Number(v.fps) : null;

  if (v.quality === 'copy') {
    if (geometry.length || scale || fps) {
      throw new Error('В режиме «Без перекодирования» нельзя менять размер, кадр или частоту кадров');
    }
    output.push('-map', '0:v:0');
    if (v.audio !== 'remove' && info?.hasAudio) output.push('-map', '0:a?');
    else output.push('-an');
    output.push('-c', 'copy');
    if (targetId === 'mp4' || targetId === 'mov') output.push('-movflags', '+faststart');
    return single(input, output, MUXER[targetId], t.total);
  }

  const codec = videoCodecArgs(targetId, v.codec, v.quality, v.speed);
  const filters = [...geometry, scale, fps ? `fps=${fps}` : null, ...codec.filters].filter(Boolean);
  output.push('-map', '0:v:0', '-vf', filters.join(','), ...codec.args);
  if (v.audio !== 'remove' && info?.hasAudio) {
    output.push('-map', '0:a?', ...audioCodecArgs(targetId, { bitrate: v.audioBitrate }, info));
  } else {
    output.push('-an');
  }
  if (targetId === 'mp4' || targetId === 'mov') output.push('-movflags', '+faststart');
  return single(input, output, MUXER[targetId], t.total);
}

function timemarkToSeconds(tm) {
  if (!tm || typeof tm !== 'string') return 0;
  return tm.split(':').reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
}

/**
 * Один запуск ffmpeg. inputs — [{ path, options }], onCancel получает функцию прерывания.
 */
function runFfmpeg({ inputs, outputPath, output, format, total, onProgress, onCancel }) {
  ensureFfmpeg();
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const cmd = ffmpeg();
    // Опции передаём отдельными аргументами — так fluent-ffmpeg не режет их по пробелам.
    // inputOptions относятся к последнему добавленному входу.
    inputs.forEach((inp, i) => {
      cmd.input(inp.path);
      const opts = i === 0 ? ['-nostdin', ...inp.options] : inp.options;
      if (opts.length) cmd.inputOptions(...opts);
    });
    cmd.format(format);
    if (output.length) cmd.outputOptions(...output);
    cmd.on('progress', (p) => {
      if (!onProgress) return;
      const sec = timemarkToSeconds(p.timemark);
      if (total > 0) onProgress(clamp(sec / total, 0, 0.99));
      else if (Number.isFinite(p.percent)) onProgress(clamp(p.percent / 100, 0, 0.99));
    });
    cmd.on('end', () => resolve());
    cmd.on('error', (err, _stdout, stderr) => {
      if (cancelled) return reject(new CancelError());
      reject(new Error(lastErrorLine(stderr) || err.message));
    });
    onCancel?.(() => {
      cancelled = true;
      cmd.kill('SIGKILL');
    });
    cmd.save(outputPath);
  });
}

module.exports = { probeMedia, summarizeProbe, buildArgs, runFfmpeg, parseTime, CancelError, MUXER };
