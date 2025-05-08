const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');

class AudioConverter extends EventEmitter {
  constructor() {
    super();
    this.supportedFormats = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
  }

  getSupportedFormats() {
    return this.supportedFormats;
  }

  async convert(filePath, outputPath, options = {}) {
    try {
      // Установка параметров по умолчанию, если не указаны
      const quality = options.quality || 'medium'; // low, medium, high
      const format = options.format || path.extname(outputPath).slice(1);
      
      // Создаем директорию, если она не существует
      await fs.ensureDir(path.dirname(outputPath));

      // Установка битрейта в зависимости от выбранной опции
      let audioBitrate;
      
      switch (quality) {
        case 'low':
          audioBitrate = '96k';
          break;
        case 'high':
          audioBitrate = '320k';
          break;
        case 'medium':
        default:
          audioBitrate = '192k';
          break;
      }

      return new Promise((resolve, reject) => {
        const command = ffmpeg(filePath)
          .output(outputPath)
          .format(format)
          .audioBitrate(audioBitrate);
          
        // Добавляем слушатели событий
        command.on('start', () => {
          this.emit('progress', 0);
        });
          
        command.on('progress', (progress) => {
          this.emit('progress', progress.percent / 100);
        });
          
        command.on('end', () => {
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
          
        command.on('error', (err) => {
          this.emit('error', err);
          reject(err);
        });
          
        // Запускаем конвертацию
        command.run();
      });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}

module.exports = AudioConverter;
