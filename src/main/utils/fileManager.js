// src/main/utils/fileManager.js
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class FileManager {
  /**
   * Генерирует путь сохранения файла в соответствии с настройками
   * @param {string} inputPath - Исходный путь к файлу
   * @param {string} sourceDirPath - Путь к исходной директории (для сохранения структуры папок)
   * @param {Object} options - Опции сохранения
   * @returns {string} - Путь для сохранения
   */
  static generateOutputPath(inputPath, sourceDirPath = null, options = {}) {
    // Если второй параметр - объект, а не строка, то это опции
    if (sourceDirPath && typeof sourceDirPath === 'object') {
      options = sourceDirPath;
      sourceDirPath = null;
    }

    const {
      outputDir, // Директория сохранения (если не указана, используется директория оригинала)
      subDir,    // Поддиректория для сохранения (создается в outputDir)
      prefix,    // Префикс имени файла
      format,    // Новый формат файла
      overwritePolicy, // Политика перезаписи: 'overwrite', 'skip', 'rename'
      preserveSubfolders = false // Сохранять ли структуру подпапок
    } = options;

    const originalDir = path.dirname(inputPath);
    const originalName = path.basename(inputPath, path.extname(inputPath));
    const newExt = format ? `.${format}` : path.extname(inputPath);

    // Определяем базовую директорию сохранения
    let baseOutputDir;

    if (outputDir) {
      // Поддержка относительных путей
      if (path.isAbsolute(outputDir)) {
        baseOutputDir = outputDir;
      } else {
        // Относительный путь разрешается от директории исходного файла или sourceDirPath
        const basePath = sourceDirPath || originalDir;
        baseOutputDir = path.resolve(basePath, outputDir);
      }
    } else if (sourceDirPath) {
      // Если указан исходный путь директории, используем его
      baseOutputDir = sourceDirPath;
    } else {
      // По умолчанию используем директорию оригинального файла
      baseOutputDir = originalDir;
    }

    // Если указана поддиректория, добавляем её
    if (subDir) {
      baseOutputDir = path.join(baseOutputDir, subDir);
    }

    // Определяем финальную директорию с учетом сохранения структуры
    let finalOutputDir = baseOutputDir;

    // Если нужно сохранить структуру подпапок И есть исходная директория
    if (preserveSubfolders && sourceDirPath) {
      // Вычисляем относительный путь от исходной директории до файла
      const relativePath = path.relative(sourceDirPath, originalDir);

      // Если относительный путь не пустой и не выходит за пределы исходной директории
      if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
        finalOutputDir = path.join(baseOutputDir, relativePath);
      }
    }

    // Обеспечиваем существование директории
    const dirCreated = !fs.existsSync(finalOutputDir);
    try {
      fs.ensureDirSync(finalOutputDir);
      if (dirCreated) {
        logger.dirCreated(finalOutputDir);
      }
    } catch (error) {
      logger.error('Ошибка создания директории', error.message);
      return null;
    }

    // Формируем новое имя файла
    const newName = `${prefix || ''}${originalName}${newExt}`;
    let outputPath = path.join(finalOutputDir, newName);

    // Обрабатываем политику перезаписи
    if (fs.existsSync(outputPath) && overwritePolicy !== 'overwrite') {
      if (overwritePolicy === 'skip') {
        logger.fileSkipped(outputPath, 'уже существует');
        return null; // Пропускаем файл
      } else {
        // Добавляем числовой суффикс
        let counter = 1;
        let uniquePath = outputPath;

        while (fs.existsSync(uniquePath)) {
          uniquePath = path.join(finalOutputDir, `${prefix || ''}${originalName}_${counter}${newExt}`);
          counter++;
        }

        outputPath = uniquePath;
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
   * Получает список подпапок в директории
   * @param {string} dirPath - Путь к директории
   * @param {boolean} recursive - Рекурсивный поиск вложенных папок
   * @returns {Array} - Массив объектов { path, name, relativePath, depth, fileCount }
   */
  static async getSubfolders(dirPath, recursive = false) {
    try {
      const result = [];

      // Оптимизированный подсчёт файлов в папке (параллельный)
      const countFilesInDir = async (dir) => {
        try {
          const items = await fs.readdir(dir, { withFileTypes: true });
          // withFileTypes возвращает Dirent объекты, что быстрее чем вызывать stat для каждого файла
          return items.filter(item => item.isFile()).length;
        } catch {
          return 0;
        }
      };

      const processDirectory = async (currentDir, depth = 0) => {
        const items = await fs.readdir(currentDir, { withFileTypes: true });

        // Собираем промисы для параллельного подсчета файлов
        const folderPromises = [];
        const folderData = [];

        for (const item of items) {
          if (item.isDirectory()) {
            const itemPath = path.join(currentDir, item.name);
            const relativePath = path.relative(dirPath, itemPath);

            folderData.push({
              itemPath,
              name: item.name,
              relativePath,
              depth
            });

            // Запускаем подсчет файлов параллельно
            folderPromises.push(countFilesInDir(itemPath));
          }
        }

        // Ждем завершения всех подсчетов параллельно
        const fileCounts = await Promise.all(folderPromises);

        // Добавляем результаты
        for (let i = 0; i < folderData.length; i++) {
          const { itemPath, name, relativePath, depth } = folderData[i];
          result.push({
            path: itemPath,
            name,
            relativePath,
            depth,
            fileCount: fileCounts[i]
          });

          // Рекурсивно обрабатываем подпапки
          if (recursive) {
            await processDirectory(itemPath, depth + 1);
          }
        }
      };

      await processDirectory(dirPath);
      return result;
    } catch (error) {
      console.error('Ошибка получения подпапок:', error);
      throw error;
    }
  }

  /**
   * Получает список файлов из директории с фильтрацией по форматам
   * @param {string} dirPath - Путь к директории
   * @param {Array} formats - Массив форматов для фильтрации
   * @param {boolean} recursive - Рекурсивный поиск во вложенных папках
   * @param {Array} selectedSubfolders - Массив путей выбранных подпапок (если пустой - все)
   * @returns {Array} - Массив путей к файлам
   */
  static async getFilesFromDirectory(dirPath, formats = [], recursive = false, selectedSubfolders = []) {
    try {
      const result = [];
      const hasSubfolderFilter = selectedSubfolders.length > 0;

      // Проверяет, находится ли путь в одной из выбранных подпапок
      const isInSelectedSubfolder = (filePath) => {
        if (!hasSubfolderFilter) return true;
        const fileDir = path.dirname(filePath);
        // Проверяем, начинается ли путь файла с одной из выбранных подпапок
        return selectedSubfolders.some(subPath =>
          fileDir === subPath || fileDir.startsWith(subPath + path.sep)
        );
      };

      // Функция для рекурсивного обхода директорий
      const processDirectory = async (currentDir) => {
        try {
          const items = await fs.readdir(currentDir);

          for (const item of items) {
            const itemPath = path.join(currentDir, item);

            try {
              const stat = await fs.stat(itemPath);

              if (stat.isDirectory()) {
                if (recursive) {
                  // Если есть фильтр подпапок, проверяем нужно ли заходить в эту папку
                  if (hasSubfolderFilter) {
                    const shouldProcess = selectedSubfolders.some(subPath =>
                      subPath === itemPath || subPath.startsWith(itemPath + path.sep) || itemPath.startsWith(subPath + path.sep)
                    );
                    if (shouldProcess) {
                      await processDirectory(itemPath);
                    }
                  } else {
                    await processDirectory(itemPath);
                  }
                }
              } else if (stat.isFile()) {
                const ext = path.extname(itemPath).toLowerCase().substring(1);

                // Проверяем формат и принадлежность к выбранным подпапкам
                if ((formats.length === 0 || formats.includes(ext)) && isInSelectedSubfolder(itemPath)) {
                  result.push(itemPath);
                }
              }
            } catch (itemError) {
              // Пропускаем недоступные файлы/папки (защищённые, удалённые и т.д.)
              console.debug(`Пропущен недоступный элемент: ${itemPath}`);
            }
          }
        } catch (dirError) {
          // Пропускаем недоступные директории (нет прав доступа и т.д.)
          console.debug(`Пропущена недоступная директория: ${currentDir}`);
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
