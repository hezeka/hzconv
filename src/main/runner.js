// src/main/runner.js
// Очередь конвертации: планирование, параллельное выполнение, отмена, отчёт.
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const EventEmitter = require('events');
const { getFileType, extOf, resolveTarget, getOutputFormat, normalizeSettings } = require('./formats');
const { readMeta, renderImage } = require('./pipeline/image');
const { probeMedia, buildArgs, runFfmpeg, CancelError } = require('./pipeline/media');
const { renderName, resolveOutputDir, templateNeedsSize, PathReserver, tempPathFor, commitTemp, today } = require('./output');
const { toDataUrl } = require('./inspect');
const logger = require('./utils/logger');

function humanizeError(error) {
  const msg = String(error?.message || error || 'Неизвестная ошибка');
  const code = error?.code;
  if (code === 'ENOSPC') return 'Недостаточно места на диске';
  if (code === 'EACCES' || code === 'EPERM') return 'Нет прав на запись — выберите другую папку';
  if (code === 'EBUSY') return 'Файл занят другой программой';
  if (code === 'ENOENT' && /open|stat/.test(msg)) return 'Файл не найден';
  if (/unsupported image format/i.test(msg)) return 'Формат не распознан или файл повреждён';
  if (/Input file is missing/i.test(msg)) return 'Файл не найден';
  if (/exceeds pixel limit/i.test(msg)) return 'Изображение слишком большое';
  if (/bad extract area/i.test(msg)) return 'Область кадрирования выходит за границы изображения';
  if (/premature end|truncated|corrupt/i.test(msg)) return 'Файл повреждён или обрезан';
  if (/Invalid data found when processing input/i.test(msg)) return 'Файл повреждён или это не медиафайл';
  if (/Output file #0 does not contain any stream|does not contain any stream/i.test(msg)) return 'В файле нет подходящих дорожек';
  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}

/** Что и чем делать с файлом. Ошибки здесь — это ошибки настроек, а не конвертации. */
function planItem(item, settings) {
  const type = getFileType(item.path);
  if (!type) throw new Error('Неподдерживаемый тип файла');
  const target = resolveTarget(item.path, type, settings[type].format);
  if (type === 'image' && (target.id === 'mp4' || target.id === 'webm')) {
    if (extOf(item.path) !== 'gif') throw new Error(`${target.ext.toUpperCase()} можно получить только из GIF`);
    return { type, target, engine: 'ffmpeg', kind: 'gif-image' };
  }
  if (type === 'image') return { type, target, engine: 'sharp' };
  return { type, target, engine: 'ffmpeg', kind: type };
}

function variantsFor(plan, settings) {
  const v = settings.image.variants;
  if (plan.type !== 'image' || plan.engine !== 'sharp' || plan.target.id === 'ico' || !v.enabled || !v.items.length) {
    return [{ suffix: '', params: {} }];
  }
  return v.items
    .filter((it) => Number(it.value) > 0)
    .map((it) => ({
      suffix: String(it.suffix || ''),
      params: it.kind === 'w' ? { variantWidth: Number(it.value) } : { factor: Number(it.value) }
    }));
}

async function pool(list, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(size, list.length)) }, async () => {
    while (cursor < list.length) {
      const job = list[cursor++];
      await worker(job);
    }
  });
  await Promise.all(runners);
}

class Runner extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.cancelled = false;
    this.jobs = new Map();
    this.finals = new Map();
    this.pendingProgress = new Map();
    this.progressTimer = null;
  }

  get busy() {
    return this.running;
  }

  reportProgress(id, value) {
    this.pendingProgress.set(id, value);
    if (this.progressTimer) return;
    this.progressTimer = setTimeout(() => this.flushProgress(), 90);
  }

  flushProgress() {
    clearTimeout(this.progressTimer);
    this.progressTimer = null;
    if (!this.pendingProgress.size) return;
    const batch = [...this.pendingProgress].map(([id, progress]) => ({ id, progress }));
    this.pendingProgress.clear();
    this.emit('progress', batch);
  }

  update(id, patch) {
    this.flushProgress();
    const event = { id, ...patch };
    if (patch.status !== 'processing') this.finals.set(id, event);
    this.emit('item', event);
  }

  cancel() {
    if (!this.running) return false;
    this.cancelled = true;
    for (const job of this.jobs.values()) job.abort?.();
    return true;
  }

  async start(items, rawSettings) {
    if (this.running) throw new Error('Конвертация уже идёт');
    const settings = normalizeSettings(rawSettings);
    this.running = true;
    this.cancelled = false;
    this.jobs.clear();
    this.finals.clear();

    const reserver = new PathReserver();
    const startedAt = Date.now();
    const summary = { total: items.length, done: 0, failed: 0, skipped: 0, cancelled: 0, inputBytes: 0, outputBytes: 0, outputDirs: [] };
    const dirs = new Set();

    const jobs = items.map((item, index) => {
      const job = { item, index, plan: null, error: null };
      try {
        job.plan = planItem(item, settings);
      } catch (e) {
        job.error = e;
      }
      return job;
    });

    const cpu = os.cpus().length || 2;
    const imageJobs = settings.performance.imageJobs > 0 ? settings.performance.imageJobs : Math.max(1, Math.min(6, Math.floor(cpu / 2)));
    const mediaJobs = Math.max(1, Math.min(4, settings.performance.mediaJobs || 1));
    // Каждое задание sharp само использует несколько потоков — делим ядра поровну.
    sharp.concurrency(Math.max(1, Math.floor(cpu / imageJobs)));

    const worker = async (job) => {
      const { item } = job;
      if (this.cancelled) {
        summary.cancelled++;
        this.update(item.id, { status: 'cancelled' });
        return;
      }
      if (job.error) {
        summary.failed++;
        this.update(item.id, { status: 'error', error: humanizeError(job.error) });
        return;
      }
      this.jobs.set(item.id, job);
      const t0 = Date.now();
      this.update(item.id, { status: 'processing', progress: 0 });
      try {
        const st = await fs.stat(item.path);
        const result = job.plan.engine === 'sharp' ? await this.runImage(job, settings, reserver, st) : await this.runMedia(job, settings, reserver, st);
        if (!result.outputs.length) {
          summary.skipped++;
          this.update(item.id, { status: 'skipped', reason: 'Файл уже существует', elapsed: Date.now() - t0 });
          return;
        }
        const outBytes = result.outputs.reduce((a, o) => a + o.size, 0);
        summary.done++;
        summary.inputBytes += st.size;
        summary.outputBytes += outBytes;
        result.outputs.forEach((o) => dirs.add(path.dirname(o.path)));
        result.outputs.forEach((o) => logger.fileConverted(item.path, o.path));
        this.update(item.id, { status: 'done', progress: 1, outputs: result.outputs, inputSize: st.size, outputSize: outBytes, elapsed: Date.now() - t0 });
      } catch (error) {
        if (error instanceof CancelError || (this.cancelled && error?.cancelled !== false)) {
          summary.cancelled++;
          this.update(item.id, { status: 'cancelled' });
        } else {
          summary.failed++;
          logger.fileError(item.path, error.message);
          this.update(item.id, { status: 'error', error: humanizeError(error), elapsed: Date.now() - t0 });
        }
      } finally {
        this.jobs.delete(item.id);
      }
    };

    try {
      const sharpJobs = jobs.filter((j) => j.plan?.engine === 'sharp' || j.error);
      const ffmpegJobs = jobs.filter((j) => j.plan?.engine === 'ffmpeg');
      await Promise.all([pool(sharpJobs, imageJobs, worker), pool(ffmpegJobs, mediaJobs, worker)]);
    } finally {
      this.flushProgress();
      this.running = false;
    }

    summary.outputDirs = [...dirs];
    // События item идут по отдельному каналу и могут прийти позже ответа —
    // поэтому итоговые статусы дублируются в сводке.
    summary.items = [...this.finals.values()];
    summary.elapsed = Date.now() - startedAt;
    summary.wasCancelled = this.cancelled;
    return summary;
  }

  checkCancel() {
    if (this.cancelled) throw new CancelError();
  }

  async finalize(tmp, finalPath, settings, st) {
    await commitTemp(tmp, finalPath);
    if (settings.output.keepDates) await fs.utimes(finalPath, st.atime, st.mtime).catch(() => {});
    return (await fs.stat(finalPath)).size;
  }

  async runImage(job, settings, reserver, st) {
    const { item, plan, index } = job;
    const meta = await readMeta(item.path);
    const fmt = getOutputFormat('image', plan.target.id);
    const target = { id: plan.target.id, alpha: fmt.alpha, animated: fmt.animated };
    const dir = resolveOutputDir(item, settings.output);
    await fs.ensureDir(dir);

    const variants = variantsFor(plan, settings);
    const name = path.basename(item.path, path.extname(item.path));
    const tpl = settings.output.template;
    const lateName = templateNeedsSize(tpl);
    const outputs = [];

    for (let i = 0; i < variants.length; i++) {
      this.checkCancel();
      const variant = variants[i];
      const vars = { name, suffix: variant.suffix, n: index + 1, date: today(), fmt: plan.target.ext };
      let finalPath = null;
      if (!lateName) {
        finalPath = reserver.claim(dir, renderName(tpl, vars), plan.target.ext, settings.output.conflict);
        if (!finalPath) continue;
      }
      let tmp = null;
      try {
        const r = await renderImage(item.path, meta, settings.image, item.edit, target, variant.params);
        this.checkCancel();
        if (!finalPath) {
          finalPath = reserver.claim(dir, renderName(tpl, { ...vars, w: r.width, h: r.height }), plan.target.ext, settings.output.conflict);
          if (!finalPath) continue;
        }
        tmp = tempPathFor(dir, plan.target.ext);
        await fs.writeFile(tmp, r.buffer);
        const size = await this.finalize(tmp, finalPath, settings, st);
        tmp = null;
        outputs.push({ path: finalPath, size, width: r.width, height: r.height });
      } catch (error) {
        reserver.release(finalPath);
        if (tmp) await fs.remove(tmp).catch(() => {});
        throw error;
      }
      this.reportProgress(item.id, (i + 1) / variants.length);
    }
    return { outputs };
  }

  async runMedia(job, settings, reserver, st) {
    const { item, plan, index } = job;
    const info = await probeMedia(item.path);
    const args = buildArgs({ kind: plan.kind, targetId: plan.target.id, settings, edit: item.edit, info });
    const dir = resolveOutputDir(item, settings.output);
    await fs.ensureDir(dir);

    const name = path.basename(item.path, path.extname(item.path));
    const tpl = settings.output.template;
    const vars = { name, suffix: '', n: index + 1, date: today(), fmt: plan.target.ext };
    const lateName = templateNeedsSize(tpl);
    let finalPath = null;
    if (!lateName) {
      finalPath = reserver.claim(dir, renderName(tpl, vars), plan.target.ext, settings.output.conflict);
      if (!finalPath) return { outputs: [] };
    }

    const tmp = tempPathFor(dir, plan.target.ext);
    const palette = args.passes.some((p) => p.out === 'palette') ? tempPathFor(dir, 'png') : null;
    try {
      let done = 0;
      for (const pass of args.passes) {
        this.checkCancel();
        const base = done;
        await runFfmpeg({
          inputs: pass.inputs.map((inp) => ({ path: inp.ref === 'palette' ? palette : item.path, options: inp.options })),
          outputPath: pass.out === 'palette' ? palette : tmp,
          output: pass.output,
          format: pass.format,
          total: args.total,
          onProgress: (p) => this.reportProgress(item.id, base + p * pass.weight),
          onCancel: (abort) => {
            job.abort = abort;
            if (this.cancelled) abort();
          }
        });
        done += pass.weight;
      }
      this.checkCancel();
      let width = null;
      let height = null;
      if (plan.target.id !== 'mp3' && plan.target.id !== 'm4a' && plan.target.id !== 'wav' && plan.type !== 'audio') {
        const outInfo = await probeMedia(tmp).catch(() => null);
        width = outInfo?.width || null;
        height = outInfo?.height || null;
      }
      if (!finalPath) {
        finalPath = reserver.claim(dir, renderName(tpl, { ...vars, w: width, h: height }), plan.target.ext, settings.output.conflict);
        if (!finalPath) {
          await fs.remove(tmp);
          return { outputs: [] };
        }
      }
      const size = await this.finalize(tmp, finalPath, settings, st);
      return { outputs: [{ path: finalPath, size, width, height }] };
    } catch (error) {
      reserver.release(finalPath);
      await fs.remove(tmp).catch(() => {});
      throw error;
    } finally {
      if (palette) await fs.remove(palette).catch(() => {});
    }
  }
}

/**
 * Предпросмотр результата для одного изображения: реальный размер файла
 * и картинки «до/после» с одинаковой геометрией.
 */
async function estimate(item, rawSettings, { maxDisplay = 2400 } = {}) {
  const settings = normalizeSettings(rawSettings);
  const plan = planItem(item, settings);
  if (plan.engine !== 'sharp') throw new Error('Предпросмотр доступен для изображений');
  const meta = await readMeta(item.path);
  const fmt = getOutputFormat('image', plan.target.id);
  const variant = variantsFor(plan, settings)[0];
  const st = await fs.stat(item.path);

  const after = await renderImage(item.path, meta, settings.image, item.edit, { id: plan.target.id, alpha: fmt.alpha, animated: fmt.animated }, variant.params);
  const before = await renderImage(item.path, meta, { ...settings.image, pngPalette: false, effort: 'fast', keepAnimation: false }, item.edit, { id: 'png', alpha: true }, variant.params);

  const tooBig = Math.max(after.width, after.height) > maxDisplay;
  const displayable = ['jpg', 'png', 'webp', 'avif', 'gif'].includes(plan.target.id);
  const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' }[plan.target.id];

  const shrink = async (buf) =>
    toDataUrl(await sharp(buf).resize(maxDisplay, maxDisplay, { fit: 'inside' }).png({ compressionLevel: 2 }).toBuffer(), 'image/png');

  let afterUrl;
  if (plan.target.id === 'ico') afterUrl = await shrink(before.buffer);
  else if (displayable && !tooBig) afterUrl = toDataUrl(after.buffer, mime);
  else afterUrl = await shrink(after.buffer);

  return {
    format: plan.target.id,
    inputSize: st.size,
    outputSize: after.buffer.length,
    width: after.width,
    height: after.height,
    downscaled: tooBig,
    before: tooBig ? await shrink(before.buffer) : toDataUrl(before.buffer, 'image/png'),
    after: afterUrl
  };
}

module.exports = { Runner, estimate, planItem, humanizeError };
