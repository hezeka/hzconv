const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');

class VideoConverter extends EventEmitter {
  constructor() {
    super();
    this.supportedFormats = ['mp4', 'avi', 'webm', 'mov', 'mkv', 'flv'];
    this.currentCommand = null;
  }

  getSupportedFormats() {
    return this.supportedFormats;
  }

  cancel() {
    if (this.currentCommand) {
      this.currentCommand.kill('SIGKILL');
      this.currentCommand = null;
    }
  }

  async convert(filePath, outputPath, options = {}) {
    try {
      // Установка параметров по умолчанию, если не указаны
      const quality = options.quality || 'medium'; // low, medium, high
      const format = options.format || path.extname(outputPath).slice(1);

      // Создаем директорию, если она не существует
      await fs.ensureDir(path.dirname(outputPath));

      // Установка качества в зависимости от выбранной опции
      let videoBitrate, audioBitrate;

      switch (quality) {
        case 'low':
          videoBitrate = '800k';
          audioBitrate = '96k';
          break;
        case 'high':
          videoBitrate = '4000k';
          audioBitrate = '192k';
          break;
        case 'medium':
        default:
          videoBitrate = '1500k';
          audioBitrate = '128k';
          break;
      }

      console.log('test:', filePath, outputPath, format, videoBitrate, audioBitrate)

      return new Promise((resolve, reject) => {
        this.currentCommand = ffmpeg(filePath)
          .output(outputPath)
          .format(format)
          .videoBitrate(videoBitrate)
          .audioBitrate(audioBitrate);

        // Добавляем слушатели событий
        this.currentCommand.on('start', () => {
          this.emit('progress', 0);
        });

        this.currentCommand.on('progress', (progress) => {
          this.emit('progress', progress.percent / 100);
        });

        this.currentCommand.on('end', () => {
          this.currentCommand = null;
          this.emit('progress', 1);
          this.emit('complete', {
            inputPath: filePath,
            outputPath: outputPath,
            format: format
          });
          resolve({
            success: true,
            inputPath: filePath,
            outputPath: outputPath
          });
        });

        this.currentCommand.on('error', (err) => {
          this.currentCommand = null;
          this.emit('error', err);
          reject(err);
        });

        // Запускаем конвертацию
        this.currentCommand.run();
      });
    } catch (error) {
      this.currentCommand = null;
      this.emit('error', error);
      throw error;
    }
  }
}

module.exports = VideoConverter;
