const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { formats, defaults } = require('./src/main/formats');
const FileManager = require('./src/main/utils/fileManager');
const inspect = require('./src/main/inspect');
const { Runner, estimate } = require('./src/main/runner');
const { ffmpegPath } = require('./src/main/ffmpeg');

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

const THEME = {
  dark: { bg: '#101012', symbols: '#a3a3ab' },
  light: { bg: '#f4f4f1', symbols: '#56565e' }
};

let mainWindow = null;
let pendingPaths = [];
const runner = new Runner();

// ——— Один экземпляр: повторный запуск передаёт файлы в уже открытое окно ———

function pathsFromArgv(argv) {
  const appPath = path.resolve(app.getAppPath());
  return argv
    .slice(1)
    .filter((a) => a && !a.startsWith('-'))
    .map((a) => path.resolve(a))
    .filter((a) => a !== appPath && fs.existsSync(a));
}

function openPaths(paths) {
  if (!paths.length) return;
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('app:open-paths', paths);
  } else {
    pendingPaths.push(...paths);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    openPaths(pathsFromArgv(argv));
  });
  pendingPaths = pathsFromArgv(process.argv);
}

app.on('open-file', (e, filePath) => {
  e.preventDefault();
  openPaths([filePath]);
});

// ——— Состояние окна ———

const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  const fallback = { width: 1180, height: 780 };
  try {
    const s = fs.readJsonSync(statePath());
    const visible = screen.getAllDisplays().some(({ workArea: a }) => s.x >= a.x - 50 && s.y >= a.y - 50 && s.x < a.x + a.width - 100 && s.y < a.y + a.height - 100);
    return visible ? s : { ...fallback, maximized: s.maximized };
  } catch {
    return fallback;
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const b = mainWindow.getNormalBounds();
    fs.outputJsonSync(statePath(), { ...b, maximized: mainWindow.isMaximized() });
  } catch {
    /* не критично */
  }
}

function overlayColors() {
  const t = nativeTheme.shouldUseDarkColors ? THEME.dark : THEME.light;
  return { color: t.bg, symbolColor: t.symbols, height: 44 };
}

function createWindow() {
  const state = loadWindowState();
  const t = nativeTheme.shouldUseDarkColors ? THEME.dark : THEME.light;

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 920,
    minHeight: 600,
    show: false,
    backgroundColor: t.bg,
    // Windows: нативные кнопки поверх нашей шапки (со Snap Layouts), macOS: «светофор».
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isWin ? overlayColors() : false,
    trafficLightPosition: { x: 16, y: 15 },
    frame: isMac || isWin,
    icon: path.join(__dirname, 'src/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  if (isDev) mainWindow.loadURL('http://localhost:8085');
  else mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  mainWindow.once('ready-to-show', () => {
    if (state.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  // Файл, брошенный мимо зоны, не должен открываться вместо приложения.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingPaths.length) {
      mainWindow.webContents.send('app:open-paths', pendingPaths);
      pendingPaths = [];
    }
  });

  const sendState = () => send('window:state', { maximized: mainWindow.isMaximized(), fullscreen: mainWindow.isFullScreen() });
  mainWindow.on('maximize', sendState);
  mainWindow.on('unmaximize', sendState);
  mainWindow.on('enter-full-screen', sendState);
  mainWindow.on('leave-full-screen', sendState);

  mainWindow.on('close', (e) => {
    if (runner.busy) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Продолжить конвертацию', 'Прервать и закрыть'],
        defaultId: 0,
        cancelId: 0,
        message: 'Конвертация ещё идёт',
        detail: 'Если закрыть окно, незавершённые файлы не сохранятся.'
      });
      if (choice === 0) {
        e.preventDefault();
        return;
      }
      runner.cancel();
    }
    saveWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

nativeTheme.on('updated', () => {
  if (mainWindow && isWin) mainWindow.setTitleBarOverlay(overlayColors());
  if (mainWindow) mainWindow.setBackgroundColor(overlayColors().color);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => runner.cancel());

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

// ——— Валидация входных данных IPC ———

const isStr = (v) => typeof v === 'string' && v.length > 0 && v.length < 32768;
const strList = (v) => (Array.isArray(v) ? v.filter(isStr) : []);
const unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;

function sanitizeEdit(edit) {
  if (!edit || typeof edit !== 'object') return null;
  const out = {
    rotate: [90, 180, 270].includes(edit.rotate) ? edit.rotate : 0,
    flipH: edit.flipH === true,
    flipV: edit.flipV === true,
    crop: null
  };
  const c = edit.crop;
  if (c && unit(c.x) && unit(c.y) && unit(c.w) && unit(c.h) && c.w > 0 && c.h > 0) {
    out.crop = { x: c.x, y: c.y, w: Math.min(c.w, 1 - c.x), h: Math.min(c.h, 1 - c.y) };
  }
  return out.rotate || out.flipH || out.flipV || out.crop ? out : null;
}

function sanitizeItem(item) {
  if (!item || !isStr(item.path)) return null;
  return { id: String(item.id ?? item.path), path: item.path, baseDir: isStr(item.baseDir) ? item.baseDir : null, edit: sanitizeEdit(item.edit) };
}

// ——— IPC ———

ipcMain.handle('app:info', () => ({
  formats,
  defaults,
  platform: process.platform,
  version: app.getVersion(),
  cpus: os.cpus().length,
  ffmpeg: Boolean(ffmpegPath),
  theme: nativeTheme.themeSource
}));

ipcMain.handle('app:set-theme', (_e, theme) => {
  if (['system', 'light', 'dark'].includes(theme)) nativeTheme.themeSource = theme;
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle('window:command', (e, command) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (command === 'minimize') win.minimize();
  if (command === 'toggle-maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
  if (command === 'close') win.close();
});

ipcMain.handle('dialog:open-files', async () => {
  const all = [...formats.input.image, ...formats.input.video, ...formats.input.audio];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Добавить файлы',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Все поддерживаемые', extensions: all },
      { name: 'Изображения', extensions: formats.input.image },
      { name: 'Видео', extensions: formats.input.video },
      { name: 'Аудио', extensions: formats.input.audio }
    ]
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('dialog:open-folder', async (_e, opts = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: isStr(opts.title) ? opts.title : 'Выбрать папку',
    defaultPath: isStr(opts.defaultPath) ? opts.defaultPath : undefined,
    properties: ['openDirectory', 'createDirectory']
  });
  return res.canceled ? null : res.filePaths[0] || null;
});

ipcMain.handle('fs:expand', (_e, { paths, recursive = true, exclude = [] } = {}) =>
  FileManager.expandPaths(strList(paths), { recursive: recursive !== false, exclude: strList(exclude) })
);

ipcMain.handle('fs:scan-folder', async (_e, { dir, recursive = true, formats: fmts = [], subfolders = [], exclude = [] } = {}) => {
  if (!isStr(dir)) return [];
  const files = await FileManager.getFilesFromDirectory(dir, { recursive: recursive !== false, formats: strList(fmts), subfolders: strList(subfolders), exclude: strList(exclude) });
  return files.map((p) => ({ path: p, baseDir: dir }));
});

ipcMain.handle('fs:subfolders', (_e, { dir, exclude = [] } = {}) => (isStr(dir) ? FileManager.getSubfolders(dir, { recursive: true, exclude: strList(exclude) }) : []));

ipcMain.handle('media:inspect', (_e, paths) => inspect.inspect(strList(paths)));
ipcMain.handle('media:details', (_e, filePath) => (isStr(filePath) ? inspect.details(filePath) : null));

ipcMain.handle('media:preview', (_e, { path: filePath, edit, maxSize = 1600, time = null, autoOrient = true } = {}) => {
  if (!isStr(filePath)) throw new Error('Не указан файл');
  const e = sanitizeEdit(edit) || {};
  return inspect.preview(filePath, { edit: { ...e, crop: null }, maxSize: Math.min(4096, Math.max(256, Number(maxSize) || 1600)), time: Number.isFinite(time) ? time : null, autoOrient: autoOrient !== false });
});

ipcMain.handle('media:estimate', (_e, { item, settings } = {}) => {
  const it = sanitizeItem(item);
  if (!it) throw new Error('Не указан файл');
  return estimate(it, settings);
});

runner.on('progress', (batch) => send('convert:progress', batch));
runner.on('item', (event) => send('convert:item', event));

ipcMain.handle('convert:start', async (_e, { items, settings } = {}) => {
  const list = (Array.isArray(items) ? items : []).map(sanitizeItem).filter(Boolean);
  if (!list.length) throw new Error('Очередь пуста');
  const summary = await runner.start(list, settings);
  if (settings?.output?.openWhenDone && summary.done > 0 && summary.outputDirs.length) {
    shell.openPath(summary.outputDirs[0]);
  }
  return summary;
});

ipcMain.handle('convert:cancel', () => runner.cancel());

ipcMain.handle('shell:reveal', (_e, p) => {
  if (isStr(p) && fs.existsSync(p)) shell.showItemInFolder(p);
});

ipcMain.handle('shell:open', async (_e, p) => {
  if (!isStr(p) || !fs.existsSync(p)) return 'Файл не найден';
  return shell.openPath(p);
});

// Картинка из буфера обмена сохраняется в «Изображения/Hzconv», чтобы у неё была понятная папка.
ipcMain.handle('clipboard:image', async () => {
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const dir = path.join(app.getPath('pictures'), 'Hzconv');
  await fs.ensureDir(dir);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.${String(d.getSeconds()).padStart(2, '0')}`;
  const file = path.join(dir, `Вставка ${stamp}.png`);
  await fs.writeFile(file, image.toPNG());
  return file;
});
