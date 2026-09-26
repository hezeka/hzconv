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
const { BatchController, scan } = require('../src/main/batch');
const { withExif } = require('./helpers/exif');
const FileManager = require('../src/main/utils/fileManager');
const { renderName } = require('../src/main/output');
const { details } = require('../src/main/inspect');
const { probeMedia, summarizeProbe, buildArgs } = require('../src/main/pipeline/media');
const { normalizeSettings } = require('../src/main/formats');
const { ffmpegPath, parseProbe } = require('../src/main/ffmpeg');

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

  // Отключённая папка не отключает вложенные: новые папки по умолчанию остаются включены
  const noNestedFiles = await FileManager.getFilesFromDirectory(src(), { recursive: true, excluded: ['nested'] });
  assert.deepEqual(noNestedFiles.filter((p) => p.includes('nested')).map((p) => path.basename(p)), ['icon.svg']);

  const noRootFiles = await FileManager.getFilesFromDirectory(src(), { recursive: true, excluded: ['', 'nested/deep'] });
  assert.deepEqual(noRootFiles.map((p) => path.basename(p)), ['alpha.png']);

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

test('сведения о файле без ffprobe: видео с телефона повёрнуто, ошибки понятны', async () => {
  const portrait = path.join(dir, 'portrait.mp4');
  ff('-display_rotation', '90', '-i', src('clip.mp4'), '-c', 'copy', portrait);
  const plain = await probeMedia(src('clip.mp4'));
  const info = await probeMedia(portrait);
  assert.deepEqual([info.width, info.height], [plain.height, plain.width]);
  assert.equal(info.videoCodec, 'h264');
  assert.ok(info.fps > 0 && info.duration > 0 && info.bitrate > 0);

  // ffmpeg сам разворачивает кадр — результат тоже вертикальный.
  const outDir = path.join(dir, 'out-portrait');
  const { results } = await convert([portrait], { video: { format: 'webm', speed: 'fast' }, output: { location: 'custom', customDir: outDir, template: '{name}-{w}x{h}' } });
  assert.equal(results[0].status, 'done', results[0].error);
  assert.equal(path.basename(results[0].outputs[0].path), `portrait-${info.width}x${info.height}.webm`);

  const broken = path.join(dir, 'broken.mp4');
  await fs.writeFile(broken, 'не видео');
  await assert.rejects(probeMedia(broken), (e) => /Не удалось прочитать файл: Invalid data/.test(e.message) && !e.message.includes(dir));
});

test('разбор вывода ffmpeg: поворот, обложка, каналы, пустые поля', () => {
  const text = [
    "[mov,mp4 @ 0x1] stray warning",
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'IMG_0001.MOV':",
    '  Metadata:',
    '    title           : Stream #0:5: Video: fake, 9999x9999',
    '  Duration: 00:01:02.50, start: 0.000000, bitrate: 15123 kb/s',
    '  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 14000 kb/s, 29.98 fps, 30 tbr, 600 tbn (default)',
    '      Side data:',
    '        Display Matrix: rotation of -90.00 degrees',
    '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, 5.1(side), fltp, 256 kb/s (default)',
    '  Stream #0:2[0x3](und): Data: none (mebx / 0x7862656D), 0 kb/s (default)',
    '  Stream #0:3: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 600x600 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)',
    'At least one output file must be specified'
  ].join('\r\n');
  const data = parseProbe(text);
  assert.equal(data.duration, 62.5);
  assert.equal(data.bitrate, 15123000);
  assert.deepEqual(data.streams.map((s) => s.type), ['video', 'audio', 'data', 'video']);
  assert.deepEqual(summarizeProbe(data), {
    duration: 62.5,
    width: 1080,
    height: 1920,
    fps: 29.98,
    hasVideo: true,
    hasAudio: true,
    hasCover: true,
    videoCodec: 'hevc',
    audioCodec: 'aac',
    sampleRate: 48000,
    channels: 6,
    bitrate: 15123000
  });

  // Старые файлы: поворот тегом rotate, звук без раскладки, неизвестная длительность.
  const old = parseProbe(
    [
      "Input #0, avi, from 'a.avi':",
      '  Duration: N/A, bitrate: N/A',
      '  Stream #0:0: Video: mpeg4 (Simple Profile) (FMP4 / 0x34504D46), yuv420p, 320x240 [SAR 1:1 DAR 4:3], 25 tbr, 25 tbn',
      '    Metadata:',
      '      rotate          : 270',
      '  Stream #0:1: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 22050 Hz, 3 channels, s16, 1058 kb/s'
    ].join('\n')
  );
  const o = summarizeProbe(old);
  assert.deepEqual([o.duration, o.bitrate, o.width, o.height, o.fps, o.channels, o.hasCover], [0, null, 240, 320, 25, 3, false]);

  assert.equal(parseProbe('/x.mp4: Invalid data found when processing input'), null);
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

test('метаданные: EXIF сохраняется при повороте и обрезке полей, удаляется по умолчанию', async () => {
  const outDir = path.join(dir, 'out-meta');
  const base = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#c04020' } })
    .composite([{ input: { create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }, left: 180, top: 80 }])
    .jpeg()
    .withMetadata({ density: 300 })
    .toBuffer();
  const file = path.join(dir, 'camera.jpg');
  await fs.writeFile(file, withExif(base, { make: 'TestCam', orientation: 6, density: 300 }));

  const hasMake = async (p) => {
    const m = await sharp(p).metadata();
    return Boolean(m.exif && m.exif.includes('TestCam'));
  };

  const cases = [
    ['keep', { metadata: 'keep', format: 'jpg' }, null, true],
    ['keep+rotate', { metadata: 'keep', format: 'jpg' }, { rotate: 90 }, true],
    ['keep+trim', { metadata: 'keep', format: 'jpg', trim: true }, null, true],
    ['strip', { metadata: 'strip', format: 'jpg' }, null, false]
  ];
  for (const [label, image, edit, keep] of cases) {
    const { results } = await convert([{ path: file, edit }], { image, output: { location: 'custom', customDir: path.join(outDir, label) } });
    const out = results[0].outputs[0].path;
    const m = await sharp(out).metadata();
    assert.equal(await hasMake(out), keep, `${label}: EXIF`);
    assert.ok(!m.orientation || m.orientation === 1, `${label}: тег ориентации должен быть сброшен`);
    if (keep) assert.equal(m.density, 300, `${label}: DPI`);
  }

  // Без автоповорота и с удалением метаданных фото всё равно не должно лечь на бок
  const { results } = await convert([file], { image: { format: 'png', metadata: 'strip', autoOrient: false }, output: { location: 'custom', customDir: path.join(outDir, 'no-orient') } });
  assert.equal(results[0].outputs[0].width, 200);
  assert.equal(results[0].outputs[0].height, 400);
});

test('HEIC с телефона: поворот по irot и по EXIF, данные съёмки, цвета Display P3, понятная ошибка', async () => {
  // phone.heic: 96×64, слева красный, справа синий в Display P3; irot 90° против часовой;
  // EXIF Make=TestCam, Orientation=6 (на пиксели уже не влияет — поворот задаёт irot).
  const heicDir = path.join(dir, 'heic');
  await fs.ensureDir(heicDir);
  const file = path.join(heicDir, 'IMG_0001.HEIC');
  await fs.copy(path.join(__dirname, 'fixtures', 'phone.heic'), file);

  const info = await details(file);
  assert.equal(info.format, 'heif');
  assert.deepEqual([info.width, info.height], [64, 96]);
  assert.match(info.thumb, /^data:image\/webp;base64,/);

  const outDir = path.join(dir, 'out-heic');
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 12);
  const cases = [
    ['strip', { format: 'original' }, false],
    ['keep', { format: 'webp', metadata: 'keep' }, true]
  ];
  for (const [label, image, keep] of cases) {
    const { results } = await convert([file], { image, output: { location: 'custom', customDir: path.join(outDir, label) } });
    assert.equal(results[0].status, 'done', results[0].error);
    const out = results[0].outputs[0].path;
    const m = await sharp(out).metadata();
    assert.deepEqual([m.width, m.height], [64, 96], label);
    assert.equal(Boolean(m.exif && m.exif.includes('TestCam')), keep, `${label}: EXIF`);
    if (keep) assert.ok(!m.orientation || m.orientation === 1, 'ориентация сброшена — кадр уже повёрнут');
    // Синяя половина наверху, красная внизу; цвета переведены из P3 в sRGB.
    const top = await pixel(out, 32, 12);
    const bottom = await pixel(out, 32, 84);
    assert.ok(near(top.slice(0, 3), [34, 61, 208]), `${label}: верх ${top}`);
    assert.ok(near(bottom.slice(0, 3), [218, 0, 26]), `${label}: низ ${bottom}`);
  }
  const original = await fs.readdir(path.join(outDir, 'strip'));
  assert.deepEqual(original, ['IMG_0001.jpg'], '«Исходный» для HEIC — JPG');

  // android.heic — тот же кадр без irot: поворот задан только EXIF (Orientation=6, по часовой),
  // как у некоторых Android-камер. Его нельзя сбрасывать, иначе фото ляжет на бок.
  const android = path.join(heicDir, 'android.heic');
  await fs.copy(path.join(__dirname, 'fixtures', 'android.heic'), android);
  const turned = await convert([android], { image: { format: 'png' }, output: { location: 'custom', customDir: path.join(outDir, 'android') } });
  assert.equal(turned.results[0].status, 'done', turned.results[0].error);
  const turnedPath = turned.results[0].outputs[0].path;
  const tm = await sharp(turnedPath).metadata();
  assert.deepEqual([tm.width, tm.height], [64, 96]);
  assert.ok(near((await pixel(turnedPath, 32, 12)).slice(0, 3), [218, 0, 26]), 'красная половина сверху');
  assert.ok(near((await pixel(turnedPath, 32, 84)).slice(0, 3), [34, 61, 208]), 'синяя половина снизу');

  const broken = path.join(heicDir, 'broken.heic');
  await fs.writeFile(broken, 'не фото');
  const { results } = await convert([broken], { image: { format: 'jpg' }, output: { location: 'custom', customDir: outDir } });
  assert.equal(results[0].status, 'error');
  assert.match(results[0].error, /HEIF/);
});

test('пакетное задание: cards_png → ../cards со структурой, исключения, только изменённые', async () => {
  const img = path.join(dir, 'img');
  const source = path.join(img, 'cards_png');
  for (const set of ['set-a', 'set-b', 'set-b/inner', 'drafts']) {
    await fs.ensureDir(path.join(source, set));
    await sharp({ create: { width: 64, height: 64, channels: 4, background: '#3366ff' } }).png().toFile(path.join(source, set, 'card.png'));
  }
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff6633' } }).jpeg().toFile(path.join(source, 'set-a', 'photo.jpg'));

  const settings = {
    image: { format: 'webp' },
    output: { location: 'custom', customDir: '../cards', preserveStructure: true, conflict: 'newer' }
  };
  const job = { dir: source, recursive: true, excluded: ['drafts'] };

  const stats = await scan(job, settings);
  assert.equal(stats.count, 4);
  assert.equal(stats.byType.image, 4);

  const events = [];
  const controller = new BatchController(new Runner(), (ch, payload) => events.push([ch, payload]));
  const first = await controller.start({ source: job, settings });
  assert.equal(first.done, 4);
  assert.equal(first.failed, 0);
  const made = (await FileManager.getFilesFromDirectory(path.join(img, 'cards'), { recursive: true })).map((p) => path.relative(path.join(img, 'cards'), p).split(path.sep).join('/'));
  assert.deepEqual(made, ['set-a/card.webp', 'set-a/photo.webp', 'set-b/card.webp', 'set-b/inner/card.webp']);
  assert.ok(events.some(([ch]) => ch === 'batch:progress'));

  // Повторный запуск: всё актуально — ничего не пересчитывается
  const second = await controller.start({ source: job, settings });
  assert.equal(second.skipped, 4);
  assert.equal(second.done, 0);

  // Изменили один исходник — обновится только он
  const touched = path.join(source, 'set-b', 'card.png');
  const future = new Date(Date.now() + 60_000);
  await fs.utimes(touched, future, future);
  const third = await controller.start({ source: job, settings });
  assert.equal(third.done, 1);
  assert.equal(third.skipped, 3);
});
