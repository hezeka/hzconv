// src/main/batch.js
// Пакетные задания: папка-источник целиком обрабатывается в main,
// интерфейс получает только агрегированный прогресс — масштабируется на десятки тысяч файлов.
const path = require('path');
const fs = require('fs-extra');
const { formats, getFileType, normalizeSettings, resolveTarget } = require('./formats');
const FileManager = require('./utils/fileManager');
const { resolveOutputDir, renderName, today, isInside } = require('./output');
const logger = require('./utils/logger');

const MAX_ERRORS = 1000;

function normalizeSource(source = {}) {
  const dir = typeof source.dir === 'string' ? source.dir : '';
  const typed = String(source.extensions || '')
    .split(/[,;\s]+/)
    .map((f) => f.trim().toLowerCase().replace(/^\*?\./, ''))
    .filter(Boolean);
  const type = ['image', 'video', 'audio'].includes(source.types) ? source.types : 'all';
  return {
    dir,
    recursive: source.recursive !== false,
    formats: typed.length ? typed : type === 'all' ? [] : formats.input[type],
    excluded: Array.isArray(source.excluded) ? source.excluded.filter((r) => typeof r === 'string') : []
  };
}

// Папка результата внутри источника не должна попадать в следующий запуск.
function outputSkips(src, settings) {
  const o = settings.output;
  const names = o.location === 'subdir' && o.subDir ? [o.subDir] : [];
  const abs = [];
  if (o.location === 'custom' && o.customDir) {
    const target = path.resolve(src.dir, o.customDir);
    if (isInside(target, src.dir) && target !== path.resolve(src.dir)) abs.push(target);
  }
  return { names, abs };
}

async function listFiles(source, settings, withStats) {
  const src = normalizeSource(source);
  if (!src.dir) throw new Error('Не выбрана папка');
  if (!(await fs.pathExists(src.dir))) throw new Error(`Папка не найдена: ${src.dir}`);
  const skips = outputSkips(src, settings);
  const files = await FileManager.getFilesFromDirectory(src.dir, {
    recursive: src.recursive,
    formats: src.formats,
    excluded: src.excluded,
    exclude: skips.names,
    withStats
  });
  const inSkipped = (p) => skips.abs.some((a) => isInside(p, a));
  return { src, files: skips.abs.length ? files.filter((f) => !inSkipped(withStats ? f.path : f)) : files };
}

async function scan(source, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const { files } = await listFiles(source, settings, true);
  const byType = { image: 0, video: 0, audio: 0 };
  let bytes = 0;
  for (const f of files) {
    byType[getFileType(f.path)]++;
    bytes += f.size;
  }
  return { count: files.length, bytes, byType, sample: files[0]?.path || null };
}

/** Пример пути результата для подсказки в интерфейсе. */
function previewOutput({ path: filePath, baseDir }, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const type = getFileType(filePath);
  if (!type) return null;
  const target = resolveTarget(filePath, type, settings[type].format);
  const dir = resolveOutputDir({ path: filePath, baseDir }, settings.output);
  const name = renderName(settings.output.template, { name: path.basename(filePath, path.extname(filePath)), w: 'Ш', h: 'В', n: 1, date: today(), fmt: target.ext });
  return { input: filePath, output: path.join(dir, `${name}.${target.ext}`) };
}

class BatchController {
  constructor(runner, send) {
    this.runner = runner;
    this.send = send;
    this.active = false;
  }

  async start({ source, settings: rawSettings, onlyPaths = null }) {
    if (this.active || this.runner.busy) throw new Error('Конвертация уже идёт');
    const settings = normalizeSettings(rawSettings);
    const { src, files } = await listFiles(source, settings, false);
    const only = Array.isArray(onlyPaths) && onlyPaths.length ? new Set(onlyPaths) : null;
    const list = only ? files.filter((f) => only.has(f)) : files;
    if (!list.length) throw new Error('В папке нет подходящих файлов');

    const items = list.map((p, i) => ({ id: String(i), path: p, baseDir: src.dir, edit: null }));
    const state = { total: items.length, done: 0, failed: 0, skipped: 0, cancelled: 0, bytesIn: 0, bytesOut: 0 };
    const current = new Map();
    const errors = [];
    let fresh = [];
    const startedAt = Date.now();

    const flush = () => {
      this.send('batch:progress', {
        ...state,
        elapsed: Date.now() - startedAt,
        current: [...current.values()],
        errors: fresh
      });
      fresh = [];
    };

    const onItem = (e) => {
      const item = items[Number(e.id)];
      if (!item) return;
      if (e.status === 'processing') {
        current.set(e.id, { name: path.relative(src.dir, item.path), progress: 0 });
        return;
      }
      current.delete(e.id);
      if (e.status === 'done') {
        state.done++;
        state.bytesIn += e.inputSize || 0;
        state.bytesOut += e.outputSize || 0;
      } else if (e.status === 'error') {
        state.failed++;
        const err = { path: item.path, rel: path.relative(src.dir, item.path), error: e.error };
        if (errors.length < MAX_ERRORS) errors.push(err);
        fresh.push(err);
      } else if (e.status === 'skipped') state.skipped++;
      else if (e.status === 'cancelled') state.cancelled++;
    };
    const onProgress = (batch) => {
      for (const { id, progress } of batch) {
        const c = current.get(id);
        if (c) c.progress = progress;
      }
    };

    this.active = true;
    this.runner.on('item', onItem);
    this.runner.on('progress', onProgress);
    const timer = setInterval(flush, 200);
    logger.directoryStart(src.dir, items.length);
    try {
      const summary = await this.runner.start(items, settings);
      logger.directoryComplete(summary.done, summary.failed, summary.total);
      flush();
      return {
        ...state,
        elapsed: summary.elapsed,
        wasCancelled: summary.wasCancelled,
        outputDirs: summary.outputDirs.slice(0, 50),
        errors,
        errorsTruncated: state.failed > errors.length
      };
    } finally {
      clearInterval(timer);
      this.runner.off('item', onItem);
      this.runner.off('progress', onProgress);
      this.active = false;
    }
  }
}

module.exports = { BatchController, scan, previewOutput, normalizeSource };
