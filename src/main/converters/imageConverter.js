const sharp = require("sharp");
const path = require("path");
const fs = require("fs-extra");
const EventEmitter = require("events");

class ImageConverter extends EventEmitter {
  constructor() {
    super();
    this.supportedFormats = [
      "jpeg",
      "jpg",
      "png",
      "webp",
      "avif",
      "tiff",
      "gif",
    ];
  }

  getSupportedFormats() {
    return this.supportedFormats;
  }

  // src/main/converters/imageConverter.js
  async convert(filePath, outputPath, options = {}) {
    try {
      console.log("Конвертация изображения:");
      console.log(`- Исходный файл: ${filePath}`);
      console.log(`- Целевой файл: ${outputPath}`);
      console.log(`- Опции: ${JSON.stringify(options)}`);

      // Проверяем, существует ли входной файл
      if (!fs.existsSync(filePath)) {
        const error = new Error(`Исходный файл не существует: ${filePath}`);
        this.emit("error", error);
        throw error;
      }

      // Установка параметров по умолчанию
      let quality;
      if (typeof options.quality === "string") {
        quality =
          options.quality === "high" ? 90 : options.quality === "low" ? 60 : 80;
      } else if (typeof options.quality === "number") {
        quality = options.quality;
      } else {
        quality = 80; // По умолчанию среднее качество
      }

      const format = options.format || path.extname(outputPath).slice(1);
      console.log(`- Используемый формат: ${format}`);
      console.log(`- Используемое качество: ${quality}`);

      // Создаем директорию, если она не существует
      await fs.ensureDir(path.dirname(outputPath));

      // Запускаем конвертацию
      this.emit("progress", 0.1);

      const image = sharp(filePath);
      const metadata = await image.metadata();
      console.log(`- Метаданные изображения: ${JSON.stringify(metadata)}`);

      this.emit("progress", 0.3);

      // Применяем формат конвертации
      let pipeline = image;

      switch (format.toLowerCase()) {
        case "jpeg":
        case "jpg":
          pipeline = pipeline.jpeg({ quality });
          break;
        case "png":
          pipeline = pipeline.png({ quality: Math.min(100, quality) });
          break;
        case "webp":
          pipeline = pipeline.webp({ quality });
          break;
        case "avif":
          pipeline = pipeline.avif({ quality });
          break;
        case "tiff":
          pipeline = pipeline.tiff({ quality });
          break;
        default:
          console.log(`- Использую формат по умолчанию: ${format}`);
          pipeline = pipeline.toFormat(format);
      }

      this.emit("progress", 0.5);

      // Сохраняем результат
      console.log(`- Сохраняем в: ${outputPath}`);
      const outputInfo = await pipeline.toFile(outputPath);
      console.log(
        `- Информация о выходном файле: ${JSON.stringify(outputInfo)}`
      );

      // Проверяем, что файл действительно создан
      if (!fs.existsSync(outputPath)) {
        const error = new Error(`Файл не был создан: ${outputPath}`);
        this.emit("error", error);
        throw error;
      }

      this.emit("progress", 1);
      this.emit("complete", {
        inputPath: filePath,
        outputPath: outputPath,
        format: format,
      });

      return {
        success: true,
        inputPath: filePath,
        outputPath: outputPath,
      };
    } catch (error) {
      console.error("Ошибка конвертации изображения:", error);
      this.emit("error", error);
      throw error;
    }
  }
}

module.exports = ImageConverter;
