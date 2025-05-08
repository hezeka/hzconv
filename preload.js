const { contextBridge, ipcRenderer } = require('electron');

// Определяем API, который будет доступен из рендерера
contextBridge.exposeInMainWorld('electronAPI', {
  // Получение поддерживаемых форматов
  getSupportedFormats: () => ipcRenderer.invoke('get-supported-formats'),
  
  // Диалоги
  openFileDialog: (options = {}) => ipcRenderer.invoke('open-file-dialog', {
    filters: options.filters || []
  }),
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  
  // Конвертация
  convertFile: (params) => {
    // Убедимся, что передаем простые данные
    const { filePath, options } = params;
    return ipcRenderer.invoke('convert-file', { 
      filePath, 
      options: JSON.parse(JSON.stringify(options || {}))
    });
  },
  convertFiles: (params) => {
    // Убедимся, что передаем простые данные
    const { filePaths, options } = params;
    console.log('Params received in preload:', params);
    return ipcRenderer.invoke('convert-files', {
      filePaths: Array.isArray(params.files) ? params.files.map(String) : [],
      options: params.options ? JSON.parse(JSON.stringify(params.options)) : {}
    });;
  },
  
  // События
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion-progress', (_, data) => callback(data));
  },
  onConversionError: (callback) => {
    ipcRenderer.on('conversion-error', (_, data) => callback(data));
  },

  // Работа с директориями
  getFilesFromDirectory: (params) => ipcRenderer.invoke('get-files-from-directory', params),
  convertDirectory: (params) => ipcRenderer.invoke('convert-directory', params),
  
  // События для обработки директорий
  onDirectoryFilesFound: (callback) => {
    ipcRenderer.on('directory-files-found', (_, data) => callback(data));
  },
  onDirectoryConversionProgress: (callback) => {
    ipcRenderer.on('directory-conversion-progress', (_, data) => callback(data));
  },
  
  // При очистке слушателей не забываем про новые события
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('conversion-progress');
    ipcRenderer.removeAllListeners('conversion-error');
    ipcRenderer.removeAllListeners('directory-files-found');
    ipcRenderer.removeAllListeners('directory-conversion-progress');
  },

  // Получение статуса конвертации
  getConversionStatus: () => ipcRenderer.invoke('get-conversion-status'),
  
  // Отмена текущей конвертации
  cancelConversion: () => ipcRenderer.invoke('cancel-conversion'),
  
  // События конвертации
  onConversionStart: (callback) => {
    ipcRenderer.on('conversion-start', (_, data) => callback(data));
  },
  onConversionComplete: (callback) => {
    ipcRenderer.on('conversion-complete', (_, data) => callback(data));
  },
  onDirectoryProgress: (callback) => {
    ipcRenderer.on('directory-conversion-progress', (_, data) => callback(data));
  },
  
  // Очистка всех слушателей
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('conversion-progress');
    ipcRenderer.removeAllListeners('conversion-error');
    ipcRenderer.removeAllListeners('conversion-start');
    ipcRenderer.removeAllListeners('conversion-complete');
    ipcRenderer.removeAllListeners('directory-conversion-progress');
    ipcRenderer.removeAllListeners('directory-files-found');
  }
});
