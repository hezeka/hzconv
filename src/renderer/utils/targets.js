import formats from '../../shared/formats.json';

const ORIGINAL = {
  image: { jpeg: 'jpg', jpe: 'jpg', jfif: 'jpg', tif: 'tiff', svg: 'png', heic: 'jpg', heif: 'jpg', hif: 'jpg' },
  video: { m4v: 'mp4' },
  audio: { aac: 'm4a', oga: 'ogg', aif: 'wav', aiff: 'wav' }
};
const KEEP = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif', 'jpe', 'jfif'],
  video: ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi'],
  audio: ['mp3', 'm4a', 'ogg', 'opus', 'flac', 'wav']
};

export function outputFormats(type) {
  return formats.output[type] || [];
}

export function inputFormats(type) {
  return formats.input[type] || [];
}

/** Итоговый формат для файла с учётом «Исходного». */
export function targetFor(item, settings) {
  const id = settings[item.type]?.format;
  if (!id || id === 'original') {
    const ext = item.ext;
    if (KEEP[item.type].includes(ext)) return { id: ORIGINAL[item.type][ext] || ext, label: (ORIGINAL[item.type][ext] || ext).toUpperCase() };
    const fallback = ORIGINAL[item.type][ext] || { image: 'png', video: 'mp4', audio: 'mp3' }[item.type];
    return { id: fallback, label: fallback.toUpperCase() };
  }
  if (item.type === 'image' && (id === 'mp4' || id === 'webm') && item.ext !== 'gif') {
    return { id, label: id.toUpperCase(), invalid: 'MP4 и WebM — только из GIF' };
  }
  return { id, label: id.toUpperCase() };
}

export const ASPECTS = [
  { value: 'none', label: 'Нет' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '3:4', label: '3:4' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' }
];

export const POSITIONS = [
  { value: 'centre', label: 'По центру' },
  { value: 'attention', label: 'Умно: главный объект', hint: 'Лица, яркие и контрастные области' },
  { value: 'entropy', label: 'Умно: больше деталей' },
  { value: 'top', label: 'Сверху' },
  { value: 'bottom', label: 'Снизу' },
  { value: 'left', label: 'Слева' },
  { value: 'right', label: 'Справа' }
];
