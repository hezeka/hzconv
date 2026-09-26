// src/main/ffmpeg.js
// Пути к бинарникам ffmpeg/ffprobe. В упакованном приложении они лежат
// в app.asar.unpacked — из самого asar запустить исполняемый файл нельзя.
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
const ffprobePath = resolveBinary(() => require('@ffprobe-installer/ffprobe').path);

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

function ensureFfmpeg() {
  if (!ffmpegPath) throw new Error('FFmpeg не найден. Переустановите приложение');
}

function probe(filePath) {
  if (!ffprobePath) return Promise.reject(new Error('FFprobe не найден'));
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
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

module.exports = { ffmpeg, ffmpegPath, ffprobePath, ensureFfmpeg, probe, runToBuffer, lastErrorLine };
