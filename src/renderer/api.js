import { toRaw, isProxy } from 'vue';

// IPC принимает только структурно клонируемые данные — снимаем реактивные прокси.
function plain(value) {
  const raw = isProxy(value) ? toRaw(value) : value;
  if (Array.isArray(raw)) return raw.map(plain);
  if (raw && typeof raw === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== undefined && typeof v !== 'function') out[k] = plain(v);
    }
    return out;
  }
  return raw;
}

const bridge = window.hz;

if (!bridge) {
  throw new Error('Мост Electron недоступен: приложение нужно запускать через Electron');
}

export const platform = bridge.platform;

export const api = {
  info: () => bridge.info(),
  setTheme: (t) => bridge.setTheme(t),
  window: (cmd) => bridge.window(cmd),
  onWindowState: (cb) => bridge.onWindowState(cb),
  onOpenPaths: (cb) => bridge.onOpenPaths(cb),
  pathForFile: (file) => file.path || bridge.pathForFile(file),

  openFiles: () => bridge.openFiles(),
  openFolder: (opts) => bridge.openFolder(plain(opts || {})),
  expandPaths: (params) => bridge.expandPaths(plain(params)),
  scanFolder: (params) => bridge.scanFolder(plain(params)),
  getSubfolders: (params) => bridge.getSubfolders(plain(params)),
  pathKind: (path) => bridge.pathKind(path),

  inspect: (paths) => bridge.inspect(plain(paths)),
  details: (path) => bridge.details(path),
  preview: (params) => bridge.preview(plain(params)),
  estimate: (params) => bridge.estimate(plain(params)),

  convert: (params) => bridge.convert(plain(params)),
  cancel: () => bridge.cancel(),
  onProgress: (cb) => bridge.onProgress(cb),
  onItem: (cb) => bridge.onItem(cb),

  batchScan: (params) => bridge.batchScan(plain(params)),
  batchStart: (params) => bridge.batchStart(plain(params)),
  onBatchProgress: (cb) => bridge.onBatchProgress(cb),
  previewOutput: (params) => bridge.previewOutput(plain(params)),
  openLogs: () => bridge.openLogs(),
  onEngineCrash: (cb) => bridge.onEngineCrash(cb),

  reveal: (path) => bridge.reveal(path),
  openPath: (path) => bridge.openPath(path),
  pasteImage: () => bridge.pasteImage()
};

// Ошибки из main приходят как «Error invoking remote method 'x': Error: текст» — оставляем только текст.
export function errorText(error) {
  const msg = String(error?.message || error || 'Неизвестная ошибка');
  return msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}
