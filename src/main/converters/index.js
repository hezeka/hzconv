const ImageConverter = require('./imageConverter');
const VideoConverter = require('./videoConverter');
const AudioConverter = require('./audioConverter');
const path = require('path');

// Создаем экземпляры конвертеров
const imageConverter = new ImageConverter();
const videoConverter = new VideoConverter();
const audioConverter = new AudioConverter();

// Получаем список всех поддерживаемых форматов
const allSupportedFormats = {
  image: imageConverter.getSupportedFormats(),
  video: videoConverter.getSupportedFormats(),
  audio: audioConverter.getSupportedFormats()
};

// Функция для определения типа файла по расширению
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase().substring(1);
  
  if (allSupportedFormats.image.includes(ext)) {
    return 'image';
  } else if (allSupportedFormats.video.includes(ext)) {
    return 'video';
  } else if (allSupportedFormats.audio.includes(ext)) {
    return 'audio';
  }
  
  return null;
}

// Функция для выбора подходящего конвертера
function getConverter(fileType) {
  switch (fileType) {
    case 'image':
      return imageConverter;
    case 'video':
      return videoConverter;
    case 'audio':
      return audioConverter;
    default:
      throw new Error(`Неподдерживаемый тип файла: ${fileType}`);
  }
}

module.exports = {
  imageConverter,
  videoConverter,
  audioConverter,
  allSupportedFormats,
  getFileType,
  getConverter
};
