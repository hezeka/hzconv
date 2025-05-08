const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { getFileType, getConverter, allSupportedFormats } = require('./src/main/converters');
const FileManager = require('./src/main/utils/fileManager');

// В main.js в начале файла:
const conversionController = require('./src/main/conversionController');

// Затем добавим IPC обработчики для отмены конвертации

// Получение статуса конвертации
ipcMain.handle('get-conversion-status', () => {
  return conversionController.getStatus();
});

// Отмена текущей конвертации
ipcMain.handle('cancel-conversion', () => {
  return conversionController.cancelConversion();
});

// Модифицируем функцию convertSingleFile
async function convertSingleFile(filePath, options, baseDirPath = null) {
  try {
    if (conversionController.isConversionCancelled()) {
      return { 
        success: false, 
        cancelled: true,
        filePath 
      };
    }
    
    console.log('Конвертация файла:', filePath);
    
    const fileType = getFileType(filePath);
    
    if (!fileType) {
      console.error(`Неподдерживаемый тип файла: ${filePath}`);
      return { 
        success: false, 
        error: `Неподдерживаемый тип файла: ${path.basename(filePath)}`,
        filePath 
      };
    }
    
    const converter = getConverter(fileType);
    
    // Используем baseDirPath при генерации пути для сохранения структуры папок
    const outputPath = FileManager.generateOutputPath(filePath, null, {
      ...options
    }, baseDirPath);
    
    if (!outputPath) {
      console.log(`Файл пропущен: ${filePath}`);
      return { 
        success: false, 
        skipped: true, 
        filePath 
      };
    }
    
    // Добавляем обработчики событий
    converter.removeAllListeners();
    
    converter.on('progress', (progress) => {
      conversionController.updateFileProgress(filePath, progress);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('conversion-progress', { 
          filePath, 
          progress 
        });
      }
    });
    
    converter.on('error', (error) => {
      console.error('Ошибка в процессе конвертации:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('conversion-error', { 
          filePath, 
          error: error.message || 'Неизвестная ошибка' 
        });
      }
    });
    
    // Регулярно проверяем, не была ли запрошена отмена
    const cancelCheckInterval = setInterval(() => {
      if (conversionController.isConversionCancelled()) {
        clearInterval(cancelCheckInterval);
        converter.emit('error', new Error('Conversion cancelled'));
      }
    }, 500);
    
    try {
      // Запускаем конвертацию
      console.log(`Начинаем конвертацию из ${filePath} в ${outputPath}`);
      const result = await converter.convert(filePath, outputPath, options);
      
      clearInterval(cancelCheckInterval);
      
      // Если конвертация была отменена во время выполнения
      if (conversionController.isConversionCancelled()) {
        return { 
          success: false, 
          cancelled: true,
          filePath 
        };
      }
      
      // Сообщаем о завершении файла
      conversionController.fileCompleted(filePath, { success: true });
      
      return {
        success: true,
        inputPath: filePath,
        outputPath: outputPath
      };
    } catch (error) {
      clearInterval(cancelCheckInterval);
      throw error;
    }
  } catch (error) {
    console.error('Ошибка конвертации:', error);
    return { 
      success: false, 
      error: error.message || 'Неизвестная ошибка',
      filePath 
    };
  }
}

// Извлекаем логику конвертации в отдельную функцию, чтобы её можно было использовать из разных обработчиков
async function convertSingleFileOLD2(filePath, options) {
  try {
    console.log('Конвертация файла:', filePath);
    console.log('Опции конвертации:', options);
    
    const fileType = getFileType(filePath);
    
    if (!fileType) {
      console.error(`Неподдерживаемый тип файла: ${filePath}`);
      return { 
        success: false, 
        error: `Неподдерживаемый тип файла: ${path.basename(filePath)}`,
        filePath 
      };
    }
    
    const converter = getConverter(fileType);
    const outputPath = FileManager.generateOutputPath(filePath, options);
    
    if (!outputPath) {
      console.log(`Файл пропущен: ${filePath}`);
      return { 
        success: false, 
        skipped: true, 
        filePath 
      };
    }
    
    // Добавляем обработчики событий, чтобы отправлять прогресс в UI
    converter.removeAllListeners();
    
    converter.on('progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('conversion-progress', { 
          filePath, 
          progress 
        });
      }
    });
    
    converter.on('error', (error) => {
      console.error('Ошибка в процессе конвертации:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('conversion-error', { 
          filePath, 
          error: error.message || 'Неизвестная ошибка' 
        });
      }
    });
    
    // Запускаем конвертацию
    console.log(`Начинаем конвертацию из ${filePath} в ${outputPath}`);
    const result = await converter.convert(filePath, outputPath, options);
    console.log('Результат конвертации:', result);
    
    // Возвращаем только сериализуемые поля
    return {
      success: true,
      inputPath: filePath,
      outputPath: outputPath
    };
  } catch (error) {
    console.error('Ошибка конвертации:', error);
    return { 
      success: false, 
      error: error.message || 'Неизвестная ошибка',
      filePath 
    };
  }
}


async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Добавляем политику безопасности контента
      webSecurity: true
    }
  });

  // Устанавливаем CSP заголовок
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"]
      }
    });
  });

  // Остальной код функции без изменений...
}


// Храним глобальную ссылку на окно, чтобы оно не закрывалось при сборке мусора
let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 590 + 70,
    minWidth: 500,
    minHeight: 500,
    maxWidth: 790,
    maxHeight: 830,
    resizable: true,
    frame: false, // Убирает стандартную рамку окна
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'path/to/icon.png'),
    autoHideMenuBar: true,
    transparent: true
  });

  // splashWindow.loadFile('splash.html');

  // mainWindow.once('ready-to-show', () => {
  //   splashWindow.close();
  //   mainWindow.show();
  // });

  // Загружаем HTML-файл в окно
  if (process.env.NODE_ENV === 'development') {
    // В режиме разработки загружаем локальный сервер Vue на порту 8085
    mainWindow.loadURL('http://localhost:8085');
    // mainWindow.webContents.openDevTools();
  } else {
    // В продакшне загружаем собранный HTML
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Обработчик закрытия окна
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.executeJavaScript(`
      document.body.style.opacity = 0;
      let fadeIn = setInterval(() => {
        let opacity = parseFloat(document.body.style.opacity);
        if (opacity < 1) {
          document.body.style.opacity = opacity + 0.1;
        } else {
          clearInterval(fadeIn);
        }
      }, 30);
    `);
  });
}





// Запуск приложения
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Выход из приложения на всех платформах кроме macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC обработчики для взаимодействия с UI

// Получение поддерживаемых форматов
ipcMain.handle('get-supported-formats', () => {
  return allSupportedFormats;
});

// Открытие диалога выбора файлов
ipcMain.handle('open-file-dialog', async (event, options = {}) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: options.filters || []
    });
    
    return result.filePaths || [];
  } catch (error) {
    console.error('Ошибка открытия диалога:', error);
    return [];
  }
});

// Открытие диалога выбора директории
ipcMain.handle('open-directory-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    
    return result.filePaths.length > 0 ? result.filePaths[0] : null;
  } catch (error) {
    console.error('Ошибка открытия диалога директорий:', error);
    return null;
  }
});


// В main.js добавьте эту функцию в начале файла
function logDetail(prefix, object) {
  console.log(`${prefix}: ${JSON.stringify(object, null, 2)}`);
}

// Обработчик для конвертации одного файла через IPC
ipcMain.handle('convert-file', async (event, { filePath, options }) => {
  return await convertSingleFile(filePath, options);
});


ipcMain.handle('window', async (event, command) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  
  switch(command) {
    case 'close':
      window.close();
      app.quit();
      break;
    case 'minimize':
      window.minimize();
      break;
    case 'maximize':
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      break;
  }
});




// Конвертация нескольких файлов
ipcMain.handle('convert-files', async (event, params) => {
  console.log('Received in main process:', params);
  
  const { filePaths, options } = params;
  
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    console.error('Invalid or empty filePaths:', filePaths);
    return [];
  }
  
  const results = [];
  
  for (const filePath of filePaths) {
    try {
      const result = await convertSingleFile(filePath, options);
      results.push(result);
    } catch (error) {
      console.error(`Error converting file ${filePath}:`, error);
      results.push({ 
        success: false, 
        error: error.message || 'Unknown error',
        filePath 
      });
    }
  }
  
  return results;
});



// Получение файлов из директории
ipcMain.handle('get-files-from-directory', async (event, { dirPath, formats = [], recursive = false }) => {
  try {
    console.log(`Запрос на получение файлов из директории: ${dirPath}`);
    console.log(`Форматы: ${formats.join(', ')}`);
    console.log(`Рекурсивно: ${recursive}`);
    
    const files = await FileManager.getFilesFromDirectory(dirPath, formats, recursive);
    return files;
  } catch (error) {
    console.error('Ошибка при получении файлов из директории:', error);
    throw error;
  }
});



// Модифицируем функцию для конвертации директории
ipcMain.handle('convert-directory', async (event, { dirPath, options, formats = [], recursive = false }) => {
  try {
    // Получаем список файлов из директории
    const filePaths = await FileManager.getFilesFromDirectory(dirPath, formats, recursive);
    
    if (filePaths.length === 0) {
      return { 
        success: true, 
        totalFiles: 0, 
        successCount: 0,
        message: 'В директории не найдено подходящих файлов'
      };
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Конвертируем каждый файл
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      
      // Сообщаем о прогрессе
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('directory-conversion-progress', {
          currentFile: i + 1,
          totalFiles: filePaths.length,
          filePath
        });
      }
      
      try {
        const fileType = getFileType(filePath);
        
        if (!fileType) {
          console.log(`Пропускаем неподдерживаемый файл: ${filePath}`);
          continue;
        }
        
        const converter = getConverter(fileType);
        
        // Генерируем выходной путь с учетом сохранения структуры папок
        const outputPath = FileManager.generateOutputPath(filePath, dirPath, {
          ...options,
          format: options.format
        });
        
        if (!outputPath) {
          console.log(`Файл пропущен согласно настройкам: ${filePath}`);
          continue;
        }
        
        // Запускаем конвертацию
        await converter.convert(filePath, outputPath, options);
        successCount++;
      } catch (fileError) {
        console.error(`Ошибка при конвертации файла ${filePath}:`, fileError);
        errorCount++;
      }
    }
    
    return {
      success: true,
      totalFiles: filePaths.length,
      successCount,
      errorCount
    };
  } catch (error) {
    console.error('Ошибка при конвертации директории:', error);
    return {
      success: false,
      error: error.message || 'Неизвестная ошибка'
    };
  }
});