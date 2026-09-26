// src/main/utils/logger.js
const path = require('path');
const fs = require('fs');

// ANSI цветовые коды
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Цвета текста
  cyan: '\x1b[36m',      // Для папок
  yellow: '\x1b[33m',    // Для подпапок
  white: '\x1b[37m',     // Для файлов
  magenta: '\x1b[35m',   // Для расширений
  green: '\x1b[32m',     // Для успеха
  red: '\x1b[31m',       // Для ошибок
  blue: '\x1b[34m',      // Для информации
  gray: '\x1b[90m',      // Для стрелок и разделителей
};

class Logger {
  constructor(debugMode = false) {
    this.debugMode = debugMode;
    this.lastOutputDir = null;
    this.file = null;
    this.verbose = debugMode || process.env.NODE_ENV === 'development';
  }

  /**
   * Журнал ошибок в файл — чтобы пользователь мог прислать его при проблеме.
   * При превышении 2 МБ старый журнал переименовывается в .old.
   */
  setFile(filePath) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 2 * 1024 * 1024) {
        fs.renameSync(filePath, `${filePath}.old`);
      }
      this.file = filePath;
    } catch {
      this.file = null;
    }
  }

  write(level, message) {
    if (!this.file) return;
    const line = `${new Date().toISOString()} ${level} ${message}\n`;
    fs.appendFile(this.file, line, () => {});
  }

  /**
   * Форматирует путь с цветовым выделением
   */
  formatPath(filePath) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);

    // Разбиваем путь на части
    const parts = dir.split(path.sep);
    const lastDir = parts[parts.length - 1];
    const parentDirs = parts.slice(0, -1).join(path.sep);

    let result = '';

    // Родительские директории (серым)
    if (parentDirs) {
      result += `${colors.dim}${parentDirs}${path.sep}${colors.reset}`;
    }

    // Последняя директория (желтым)
    result += `${colors.yellow}${lastDir}${colors.reset}${path.sep}`;

    // Имя файла (белым)
    result += `${colors.white}${base}${colors.reset}`;

    // Расширение (пурпурным)
    if (ext) {
      result += `${colors.magenta}${ext}${colors.reset}`;
    }

    return result;
  }

  /**
   * Выводит информацию о создании директории
   */
  dirCreated(dirPath) {
    if (!this.verbose) return;
    console.log(`${colors.green}[✓]${colors.reset} ${colors.cyan}Создана директория:${colors.reset} ${colors.bright}${dirPath}${colors.reset}`);
    this.lastOutputDir = dirPath;
  }

  /**
   * Выводит информацию о конвертации файла
   */
  fileConverted(inputPath, outputPath) {
    // На десятках тысяч файлов построчный лог только мешает — выводим его при отладке.
    if (!this.verbose) return;
    const formattedInput = this.formatPath(inputPath);
    const formattedOutput = this.formatPath(outputPath);
    const arrow = `${colors.gray}→${colors.reset}`;

    console.log(`${colors.green}[✓]${colors.reset} ${formattedInput} ${arrow} ${formattedOutput}`);
  }

  /**
   * Выводит информацию о пропущенном файле
   */
  fileSkipped(filePath, reason = '') {
    const formatted = this.formatPath(filePath);
    const reasonText = reason ? ` ${colors.dim}(${reason})${colors.reset}` : '';
    console.log(`${colors.yellow}[⊘]${colors.reset} Пропущен: ${formatted}${reasonText}`);
  }

  /**
   * Выводит информацию об ошибке
   */
  fileError(filePath, error) {
    this.write('ERROR', `${filePath}: ${error}`);
    const formatted = this.formatPath(filePath);
    console.log(`${colors.red}[✗]${colors.reset} Ошибка: ${formatted}`);
    if (this.debugMode) {
      console.log(`${colors.dim}    ${error}${colors.reset}`);
    }
  }

  /**
   * Выводит начало конвертации директории
   */
  directoryStart(dirPath, totalFiles) {
    this.write('INFO', `Пакет: ${dirPath}, файлов: ${totalFiles}`);
    console.log(`\n${colors.bright}${colors.cyan}━━━ Конвертация директории ━━━${colors.reset}`);
    console.log(`${colors.blue}[i]${colors.reset} Исходная директория: ${colors.cyan}${dirPath}${colors.reset}`);
    console.log(`${colors.blue}[i]${colors.reset} Всего файлов: ${colors.bright}${totalFiles}${colors.reset}\n`);
  }

  /**
   * Выводит завершение конвертации директории
   */
  directoryComplete(successCount, errorCount, totalFiles) {
    this.write('INFO', `Пакет завершён: успешно ${successCount}, ошибок ${errorCount} из ${totalFiles}`);
    console.log(`\n${colors.bright}${colors.cyan}━━━ Конвертация завершена ━━━${colors.reset}`);
    console.log(`${colors.green}[✓]${colors.reset} Успешно: ${colors.bright}${successCount}${colors.reset}/${totalFiles}`);
    if (errorCount > 0) {
      console.log(`${colors.red}[✗]${colors.reset} Ошибок: ${colors.bright}${errorCount}${colors.reset}/${totalFiles}`);
    }
    console.log();
  }

  /**
   * Отладочный лог (выводится только в debug режиме)
   */
  debug(...args) {
    if (this.debugMode) {
      console.log(`${colors.dim}[DEBUG]${colors.reset}`, ...args);
    }
  }

  /**
   * Информационный лог
   */
  info(message) {
    console.log(`${colors.blue}[i]${colors.reset} ${message}`);
  }

  /**
   * Лог успеха
   */
  success(message) {
    console.log(`${colors.green}[✓]${colors.reset} ${message}`);
  }

  /**
   * Лог ошибки
   */
  error(message, details = null) {
    this.write('ERROR', details ? `${message}: ${details}` : message);
    console.log(`${colors.red}[✗]${colors.reset} ${message}`);
    if (details && this.debugMode) {
      console.log(`${colors.dim}    ${details}${colors.reset}`);
    }
  }
}

// Создаем глобальный экземпляр
// Можно включить debugMode через переменную окружения: DEBUG=true
const logger = new Logger(process.env.DEBUG === 'true');

module.exports = logger;
