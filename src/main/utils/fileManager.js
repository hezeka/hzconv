// src/main/utils/fileManager.js
const fs = require('fs-extra');
const path = require('path');

class FileManager {
  /**
   * Генерирует путь сохранения файла в соответствии с настройками
   * @param {string} inputPath - Исходный путь к файлу
   * @param {string} sourceDirPath - Путь к исходной директории (для сохранения структуры папок)
   * @param {Object} options - Опции сохранения
   * @returns {string} - Путь для сохранения
   */
  static generateOutputPath(inputPath, sourceDirPath = null, options = {}) {
    console.log('Генерация пути:', { inputPath, sourceDirPath, options });
    
    // Если второй параметр - объект, а не строка, то это опции
    if (sourceDirPath && typeof sourceDirPath === 'object') {
      options = sourceDirPath;
      sourceDirPath = null;
      console.log('sourceDirPath обнаружен как options:', { options });
    }
    
    const {
      outputDir, // Директория сохранения (если не указана, используется директория оригинала)
      subDir,    // Поддиректория для сохранения (создается в outputDir)
      prefix,    // Префикс имени файла
      format,    // Новый формат файла
      overwritePolicy // Политика перезаписи: 'overwrite', 'skip', 'rename'
    } = options;
    
    const originalDir = path.dirname(inputPath);
    const originalName = path.basename(inputPath, path.extname(inputPath));
    const newExt = format ? `.${format}` : path.extname(inputPath);
    
    console.log('Данные пути:', {
      originalDir,
      originalName, 
      newExt,
      format
    });
    
    // Определяем директорию сохранения
    let saveDir;
    
    if (outputDir) {
      // Если указана выходная директория, используем ее
      saveDir = outputDir;
      console.log('Используется указанная выходная директория:', saveDir);
    } else if (sourceDirPath) {
      // Если указан исходный путь директории, используем его
      saveDir = sourceDirPath;
      console.log('Используется исходный путь директории:', saveDir);
    } else {
      // По умолчанию используем директорию оригинального файла
      saveDir = originalDir;
      console.log('Используется директория оригинального файла:', saveDir);
    }
    
    // Если указана поддиректория, добавляем её
    if (subDir) {
      saveDir = path.join(saveDir, subDir);
      console.log('Добавлена поддиректория, итоговый путь:', saveDir);
    }
    
    // Обеспечиваем существование директории
    try {
      fs.ensureDirSync(saveDir);
      console.log('Директория создана/проверена:', saveDir);
    } catch (error) {
      console.error('Ошибка создания директории:', error);
      return null;
    }
    
    // Формируем новое имя файла
    const newName = `${prefix || ''}${originalName}${newExt}`;
    let outputPath = path.join(saveDir, newName);
    
    console.log('Полный путь сохранения:', outputPath);
    
    // Обрабатываем политику перезаписи
    if (fs.existsSync(outputPath) && overwritePolicy !== 'overwrite') {
      if (overwritePolicy === 'skip') {
        console.log('Файл пропущен (уже существует):', outputPath);
        return null; // Пропускаем файл
      } else {
        // Добавляем числовой суффикс
        let counter = 1;
        let uniquePath = outputPath;
        
        while (fs.existsSync(uniquePath)) {
          uniquePath = path.join(saveDir, `${prefix || ''}${originalName}_${counter}${newExt}`);
          counter++;
        }
        
        outputPath = uniquePath;
        console.log('Путь изменен для избежания перезаписи:', outputPath);
      }
    }
    
    return outputPath;
  }
  
  
  /**
   * Проверяет существует ли файл
   */
  static fileExists(filePath) {
    return fs.existsSync(filePath);
  }
  
  /**
   * Получает список файлов из директории с фильтрацией по форматам
   * @param {string} dirPath - Путь к директории
   * @param {Array} formats - Массив форматов для фильтрации
   * @param {boolean} recursive - Рекурсивный поиск во вложенных папках
   * @returns {Array} - Массив путей к файлам
   */
  static async getFilesFromDirectory(dirPath, formats = [], recursive = false) {
    try {
      const result = [];
      
      // Функция для рекурсивного обхода директорий
      const processDirectory = async (currentDir) => {
        const items = await fs.readdir(currentDir);
        
        for (const item of items) {
          const itemPath = path.join(currentDir, item);
          const stat = await fs.stat(itemPath);
          
          if (stat.isDirectory()) {
            if (recursive) {
              await processDirectory(itemPath);
            }
          } else if (stat.isFile()) {
            const ext = path.extname(itemPath).toLowerCase().substring(1);
            
            // Если форматы не указаны или файл соответствует одному из форматов
            if (formats.length === 0 || formats.includes(ext)) {
              result.push(itemPath);
            }
          }
        }
      };
      
      await processDirectory(dirPath);
      return result;
    } catch (error) {
      console.error('Ошибка получения файлов из директории:', error);
      throw error;
    }
  }
}

module.exports = FileManager;
