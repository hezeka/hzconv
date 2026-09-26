// Интеграционные тесты движка конвертации: реальные sharp и ffmpeg, без Electron.
// Запуск: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { spawnSync } = require('child_process');

const { Runner, estimate } = require('../src/main/runner');
const FileManager = require('../src/main/utils/fileManager');
const { renderName } = require('../src/main/output');
const { probeMedia, buildArgs } = require('../src/main/pipeline/media');
const { normalizeSettings } = require('../src/main/formats');
const { ffmpegPath } = require('../src/main/ffmpeg');

let dir;
let seq = 0;

const ff = (...args) => {
  const r = spawnSync(ffmpegPath, ['-nostdin', '-loglevel', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

async function convert(files, settings) {
  const runner = new Runner();
  const events = [];
  runner.on('item', (e) => events.push(e));
  const items = files.map((f) => ({ id: `t${++seq}`, baseDir: null, edit: null, ...(typeof f === 'string' ? { path: f } : f) }));
  const summary = await runner.start(items, settings);
  const final = items.map((it) => [...events].reverse().find((e) => e.id === it.id && e.status !== 'processing'));
  return { summary, results: final };
}

const pixel = async (file, x, y) => {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [...data.slice(i, i + info.channels)];
};

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hzconv-test-'));
  const src = path.join(dir, 'src');
  await fs.ensureDir(path.join(src, 'nested', 'deep'));

  // 400×200: красный, зелёный квадрат в левом верхнем углу; EXIF «повернуть на 90° по часовой»
  await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ff0000' } })
    .composite([{ input: { create: { width: 40, height: 40, channels: 3, background: '#00ff00' } }, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toFile(path.join(src, 'rotated.jpg'));

  await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0 } } })
    .composite([{ input: { create: { width: 100, height: 100, channels: 4, background: '#000000ff' } }, left: 100, top: 100 }])
    .png()
    .toFile(path.join(src, 'nested', 'alpha.png'));

  await fs.writeFile(path.join(src, 'nested', 'deep', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#123456"/></svg>');
  await fs.writeFile(path.join(src, 'readme.txt'), 'not media');

  ff('-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=1', path.join(src, 'anim.gif'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(src, 'clip.mp4'));
  ff('-f', 'lavfi', '-i', 'sine=frequency=300:duration=3', '-ac', '2', path.join(src, 'tone.wav'));
});

after(async () => {
  if (dir) await fs.remove(dir);
});

const src = (...p) => path.join(dir, 'src', ...p);

test('поиск файлов: только поддерживаемые, фильтр подпапок и исключения', async () => {
  const all = await FileManager.getFilesFromDirectory(src(), { recursive: true });
  const names = all.map((p) => path.basename(p)).sort();
  assert.deepEqual(names, ['alpha.png', 'anim.gif', 'clip.mp4', 'icon.svg', 'rotated.jpg', 'tone.wav']);

  const onlyDeep = await FileManager.getFilesFromDirectory(src(), { recursive: true, subfolders: [src('nested', 'deep')] });
  assert.deepEqual(onlyDeep.map((p) => path.basename(p)), ['icon.svg']);

  const rootOnly = await FileManager.getFilesFromDirectory(src(), { recursive: true, subfolders: [src()] });
  assert.ok(!rootOnly.some((p) => p.includes('nested')));

  const noNested = await FileManager.getFilesFromDirectory(src(), { recursive: true, exclude: ['nested'] });
  assert.ok(!noNested.some((p) => p.includes('nested')));

  const pngOnly = await FileManager.getFilesFromDirectory(src(), { recursive: true, formats: ['png'] });
  assert.deepEqual(pngOnly.map((p) => path.basename(p)), ['alpha.png']);
});

test('EXIF-ориентация применяется, кроп считается в повёрнутых координатах', async () => {
  const { results } = await convert([{ path: src('rotated.jpg'), edit: { crop: { x: 0.5, y: 0, w: 0.5, h: 0.25 } } }], {
    image: { format: 'png' },
    output: { location: 'custom', customDir: path.join(dir, 'out-exif') }
  });
  const out = results[0].outputs[0];
  // После поворота 200×400, правая верхняя четверть по ширине и 1/4 по высоте → 100×100
  assert.equal(out.width, 100);
  assert.equal(out.height, 100);
  // Зелёный угол после поворота на 90° оказывается справа сверху
  const [r, g] = await pixel(out.path, 95, 5);
  assert.ok(g > 200 && r < 60, `ожидался зелёный пиксель, получено ${r},${g}`);
});

test('PNG по умолчанию без палитры, JPG заливает прозрачность цветом фона', async () => {
  const outDir = path.join(dir, 'out-alpha');
  const png = await convert([src('nested', 'alpha.png')], { image: { format: 'png' }, output: { location: 'custom', customDir: outDir } });
  const meta = await sharp(png.results[0].outputs[0].path).metadata();
  assert.equal(meta.paletteBitDepth, undefined, 'PNG не должен квантоваться без явного выбора палитры');
  assert.equal(meta.hasAlpha, true);

  const jpg = await convert([src('nested', 'alpha.png')], { image: { format: 'jpg', background: '#ff00ff' }, output: { location: 'custom', customDir: outDir } });
  const [r, g, b] = await pixel(jpg.results[0].outputs[0].path, 5, 5);
  assert.ok(r > 240 && g < 20 && b > 240, `фон должен быть пурпурным, получено ${r},${g},${b}`);
});

test('варианты размеров, шаблон имени и сохранение структуры папок', async () => {
  const outDir = path.join(dir, 'out-variants');
  const items = [{ path: src('nested', 'alpha.png'), baseDir: src() }];
  const { results } = await convert(items, {
    image: {
      format: 'webp',
      resize: { mode: 'width', width: 50 },
      variants: { enabled: true, items: [{ kind: 'x', value: 1, suffix: '@1x' }, { kind: 'x', value: 2, suffix: '@2x' }] }
    },
    output: { location: 'custom', customDir: outDir, template: '{name}-{w}', preserveStructure: true }
  });
  const outs = results[0].outputs.map((o) => path.relative(outDir, o.path).split(path.sep).join('/'));
  assert.deepEqual(outs, ['nested/alpha-50@1x.webp', 'nested/alpha-100@2x.webp']);
});

test('SVG растеризуется в целевом размере, ICO содержит все размеры', async () => {
  const outDir = path.join(dir, 'out-svg');
  const png = await convert([src('nested', 'deep', 'icon.svg')], { image: { format: 'png', resize: { mode: 'width', width: 512, enlarge: true } }, output: { location: 'custom', customDir: outDir } });
  assert.equal(png.results[0].outputs[0].width, 512);

  const ico = await convert([src('nested', 'deep', 'icon.svg')], { image: { format: 'ico', icoSizes: [16, 32, 256] }, output: { location: 'custom', customDir: outDir } });
  const buf = await fs.readFile(ico.results[0].outputs[0].path);
  assert.equal(buf.readUInt16LE(2), 1);
  assert.equal(buf.readUInt16LE(4), 3);
  assert.deepEqual([buf[6], buf[22], buf[38]], [16, 32, 0]); // 0 означает 256
});

test('анимированный GIF → WebP сохраняет кадры, GIF → MP4 через ffmpeg', async () => {
  const outDir = path.join(dir, 'out-anim');
  const webp = await convert([src('anim.gif')], { image: { format: 'webp', resize: { mode: 'width', width: 80 } }, output: { location: 'custom', customDir: outDir } });
  const m = await sharp(webp.results[0].outputs[0].path, { animated: true }).metadata();
  assert.equal(m.pages, 10);
  assert.equal(webp.results[0].outputs[0].height, 60);

  const mp4 = await convert([src('anim.gif')], { image: { format: 'mp4' }, output: { location: 'custom', customDir: outDir } });
  const info = await probeMedia(mp4.results[0].outputs[0].path);
  assert.equal(info.videoCodec, 'h264');

  const wrong = await convert([src('rotated.jpg')], { image: { format: 'mp4' }, output: { location: 'custom', customDir: outDir } });
  assert.equal(wrong.results[0].status, 'error');
});

test('политики конфликтов: переименование, пропуск, замена', async () => {
  const outDir = path.join(dir, 'out-conflict');
  const s = (conflict) => ({ image: { format: 'webp' }, output: { location: 'custom', customDir: outDir, conflict } });
  await convert([src('rotated.jpg')], s('rename'));
  const second = await convert([src('rotated.jpg')], s('rename'));
  assert.equal(path.basename(second.results[0].outputs[0].path), 'rotated_1.webp');
  const skipped = await convert([src('rotated.jpg')], s('skip'));
  assert.equal(skipped.results[0].status, 'skipped');
  const replaced = await convert([src('rotated.jpg')], s('overwrite'));
  assert.equal(path.basename(replaced.results[0].outputs[0].path), 'rotated.webp');
  // Временные файлы не остаются
  assert.ok(!(await fs.readdir(outDir)).some((f) => f.includes('.part.')));
});

test('видео: 240p с обрезкой по времени, GIF в два прохода, извлечение звука', async () => {
  const outDir = path.join(dir, 'out-video');
  const mp4 = await convert([src('clip.mp4')], { video: { format: 'mp4', resolution: '240', trimStart: '1', trimEnd: '3' }, output: { location: 'custom', customDir: outDir } });
  const info = await probeMedia(mp4.results[0].outputs[0].path);
  assert.equal(info.height, 240);
  assert.equal(info.width, 426);
  assert.ok(Math.abs(info.duration - 2) < 0.2, `длительность ${info.duration}`);

  const gif = await convert([src('clip.mp4')], { video: { format: 'gif', gifWidth: 200, gifFps: 10, trimEnd: '2' }, output: { location: 'custom', customDir: outDir } });
  const gm = await sharp(gif.results[0].outputs[0].path, { animated: true }).metadata();
  assert.equal(gm.width, 200);
  assert.ok(gm.pages >= 19 && gm.pages <= 21, `кадров: ${gm.pages}`);
  assert.ok(!(await fs.readdir(outDir)).some((f) => f.endsWith('.png')), 'временная палитра должна удаляться');

  const mp3 = await convert([src('clip.mp4')], { video: { format: 'mp3' }, output: { location: 'custom', customDir: outDir } });
  const am = await probeMedia(mp3.results[0].outputs[0].path);
  assert.equal(am.audioCodec, 'mp3');
  assert.equal(am.hasVideo, false);
});

test('аудио: Opus с нормализацией и моно', async () => {
  const outDir = path.join(dir, 'out-audio');
  const { results } = await convert([src('tone.wav')], { audio: { format: 'opus', normalize: true, channels: '1', bitrate: 96 }, output: { location: 'custom', customDir: outDir } });
  assert.equal(results[0].status, 'done', results[0].error);
  const info = await probeMedia(results[0].outputs[0].path);
  assert.equal(info.audioCodec, 'opus');
  assert.equal(info.channels, 1);
});

test('режим без перекодирования запрещает фильтры', () => {
  const settings = normalizeSettings({ video: { quality: 'copy', resolution: '720' } });
  assert.throws(() => buildArgs({ kind: 'video', targetId: 'mp4', settings, edit: null, info: { duration: 1, hasAudio: true } }), /Без перекодирования/);
});

test('отмена останавливает ffmpeg и не оставляет мусора', async () => {
  const outDir = path.join(dir, 'out-cancel');
  const runner = new Runner();
  const items = [{ id: 'c1', path: src('clip.mp4'), baseDir: null, edit: null }];
  const started = new Promise((resolve) => runner.on('item', (e) => e.status === 'processing' && resolve()));
  const done = runner.start(items, { video: { format: 'webm', quality: 'max', speed: 'max' }, output: { location: 'custom', customDir: outDir } });
  await started;
  await new Promise((r) => setTimeout(r, 300));
  runner.cancel();
  const summary = await done;
  assert.equal(summary.cancelled, 1);
  assert.deepEqual(await fs.readdir(outDir), []);
});

test('предпросмотр возвращает реальный размер результата', async () => {
  const res = await estimate({ path: src('nested', 'alpha.png') }, { image: { format: 'webp', quality: 50 } });
  assert.equal(res.format, 'webp');
  assert.ok(res.outputSize > 0);
  assert.match(res.after, /^data:image\/webp;base64,/);
  assert.equal(res.width, 300);
});

test('шаблон имени: запрещённые символы и пустые размеры', () => {
  assert.equal(renderName('{name}-{w}x{h}', { name: 'song' }), 'song');
  assert.equal(renderName('a/b:{name}', { name: 'x' }), 'a_b_x');
  assert.equal(renderName('{name}', { name: 'pic', suffix: '@2x' }), 'pic@2x');
  assert.equal(renderName('', { name: 'x' }), 'x');
  assert.equal(renderName('{date}', { name: 'x', date: '2026-01-02' }), '2026-01-02');
});
