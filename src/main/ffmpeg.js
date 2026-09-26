// src/main/ffmpeg.js
// Путь к ffmpeg. В упакованном приложении он лежит в app.asar.unpacked —
// из самого asar запустить исполняемый файл нельзя.
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

const unpacked = (p) => (p ? p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') : p);

function resolveBinary(load) {
  try {
    const p = unpacked(load());
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const ffmpegPath = resolveBinary(() => require('ffmpeg-static'));

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

function ensureFfmpeg() {
  if (!ffmpegPath) throw new Error('FFmpeg не найден. Переустановите приложение');
}

// ——— Сведения о файле ———
// Отдельный ffprobe не нужен: `ffmpeg -i файл` печатает те же сведения в stderr.
// Это минус 70–80 МБ в сборке.

const LAYOUT_CHANNELS = { mono: 1, stereo: 2, downmix: 2, quad: 4, hexagonal: 6, octagonal: 8, hexadecagonal: 16 };

/** «stereo», «5.1(side)», «3 channels» → число каналов. */
function parseChannels(layout) {
  const s = String(layout ?? '').trim().toLowerCase();
  const name = s.replace(/\(.*\)$/, '');
  if (LAYOUT_CHANNELS[name]) return LAYOUT_CHANNELS[name];
  const dotted = /^(\d+)\.(\d+)$/.exec(name);
  if (dotted) return Number(dotted[1]) + Number(dotted[2]);
  const counted = /^(\d+) channels?$/.exec(s);
  return counted ? Number(counted[1]) : null;
}

/** «29.97», «90k» → число. */
function parseRate(match) {
  if (!match) return null;
  const n = parseFloat(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTimecode(tc) {
  return tc.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0) || 0;
}

function parseStream(type, rest) {
  const stream = { type, codec: /^([\w-]+)/.exec(rest)?.[1] || null };
  if (type === 'video') {
    // Размер стоит после запятой: так его не спутать с «0x31637661» в теге кодека.
    const size = /,\s(\d{1,5})x(\d{1,5})(?=[\s,[]|$)/.exec(rest);
    stream.width = size ? Number(size[1]) : 0;
    stream.height = size ? Number(size[2]) : 0;
    stream.fps = parseRate(/,\s([\d.]+)(k?) fps/.exec(rest)) || parseRate(/,\s([\d.]+)(k?) tbr/.exec(rest));
    stream.cover = /\(attached pic\)/.test(rest);
  } else if (type === 'audio') {
    const m = /(\d+) Hz(?:,\s*([^,]+))?/.exec(rest);
    stream.sampleRate = m ? Number(m[1]) : null;
    stream.channels = m ? parseChannels(m[2]) : null;
  }
  return stream;
}

/**
 * Разбирает блок «Input #0» из stderr ffmpeg:
 * { duration, bitrate, streams: [{ type, codec, width, height, fps, cover, rotation, sampleRate, channels }] }.
 * rotation — угол из матрицы отображения (как у ffprobe) или устаревшего тега rotate.
 */
function parseProbe(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('Input #0'));
  if (start < 0) return null;
  const info = { duration: 0, bitrate: null, streams: [] };
  let stream = null;
  for (const line of lines.slice(start + 1)) {
    // Блок входа целиком с отступом; первая строка без отступа — уже не он.
    if (!/^\s/.test(line)) break;
    let m = /^\s+Duration: ([\d:.]+|N\/A)(?:.*?bitrate: (\d+) kb\/s)?/.exec(line);
    if (m) {
      info.duration = m[1] === 'N/A' ? 0 : parseTimecode(m[1]);
      info.bitrate = m[2] ? Number(m[2]) * 1000 : null;
      stream = null;
      continue;
    }
    m = /^\s+Stream #0:\d+\S*: (Video|Audio|Subtitle|Data|Attachment): (.*)$/.exec(line);
    if (m) {
      stream = parseStream(m[1].toLowerCase(), m[2]);
      info.streams.push(stream);
      continue;
    }
    if (!stream) continue;
    m = /^\s+display ?matrix: rotation of (-?[\d.]+) degrees/i.exec(line);
    if (m && Number.isFinite(Number(m[1]))) {
      stream.rotation = Number(m[1]);
      continue;
    }
    m = /^\s+rotate\s*: (-?\d+)\s*$/.exec(line);
    if (m && stream.rotation === undefined) stream.rotation = -Number(m[1]);
  }
  return info;
}

function probe(filePath, { timeout = 30000 } = {}) {
  if (!ffmpegPath) return Promise.reject(new Error('FFmpeg не найден. Переустановите приложение'));
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', filePath], { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeout);
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (c) => {
      if (stderr.length < 512 * 1024) stderr += c;
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    // Без выходного файла ffmpeg всегда завершается с ошибкой — смотрим только на разобранный блок.
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      const info = parseProbe(stderr);
      if (info) return resolve(info);
      const line = lastErrorLine(stderr).replace(`${filePath}: `, '');
      const reason = line || (signal ? `ffmpeg аварийно завершился (${signal})` : `ffmpeg завершился с кодом ${code}`);
      reject(new Error(`Не удалось прочитать файл: ${reason}`));
    });
  });
}

/**
 * Запускает ffmpeg и возвращает stdout целиком. Используется для превью кадров.
 */
function runToBuffer(args, { timeout = 20000 } = {}) {
  ensureFfmpeg();
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-nostdin', ...args], { windowsHide: true });
    const chunks = [];
    let stderr = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeout);
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => {
      stderr = (stderr + c).slice(-4000);
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (code === 0 && out.length) resolve(out);
      else reject(new Error(lastErrorLine(stderr) || `ffmpeg завершился с кодом ${code}`));
    });
  });
}

// Из простыни stderr вытаскиваем строку, которая реально объясняет ошибку.
function lastErrorLine(stderr = '') {
  const lines = String(stderr)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hint = [...lines]
    .reverse()
    .find((l) => /error|invalid|not supported|unsupported|no such|denied|failed|unknown|could not|cannot/i.test(l) && !/^\s*conversion failed!?$/i.test(l));
  return hint || lines[lines.length - 1] || '';
}

module.exports = { ffmpeg, ffmpegPath, ensureFfmpeg, probe, parseProbe, runToBuffer, lastErrorLine };
