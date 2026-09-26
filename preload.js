const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

// Подписка возвращает функцию отписки — никаких глобальных removeAllListeners.
const subscribe = (channel) => (callback) => {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('hz', {
  platform: process.platform,

  info: () => invoke('app:info'),
  setTheme: (theme) => invoke('app:set-theme', theme),
  window: (command) => invoke('window:command', command),
  onWindowState: subscribe('window:state'),
  onOpenPaths: subscribe('app:open-paths'),

  // Путь к файлу из drag & drop (в новых версиях Electron File.path убран).
  pathForFile: (file) => {
    try {
      return webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : file.path || '';
    } catch {
      return '';
    }
  },

  openFiles: () => invoke('dialog:open-files'),
  openFolder: (opts) => invoke('dialog:open-folder', opts),
  expandPaths: (params) => invoke('fs:expand', params),
  scanFolder: (params) => invoke('fs:scan-folder', params),
  getSubfolders: (params) => invoke('fs:subfolders', params),

  inspect: (paths) => invoke('media:inspect', paths),
  details: (path) => invoke('media:details', path),
  preview: (params) => invoke('media:preview', params),
  estimate: (params) => invoke('media:estimate', params),

  convert: (params) => invoke('convert:start', params),
  cancel: () => invoke('convert:cancel'),
  onProgress: subscribe('convert:progress'),
  onItem: subscribe('convert:item'),

  reveal: (path) => invoke('shell:reveal', path),
  openPath: (path) => invoke('shell:open', path),
  pasteImage: () => invoke('clipboard:image')
});
