// Поток-декодер HEIC/HEIF: у каждого потока свой экземпляр libheif (WebAssembly),
// поэтому фото с телефона раскодируются параллельно и не блокируют движок.
const { parentPort } = require('worker_threads');

// libheif пишет диагностику в console.log — в журнал движка она не нужна.
console.log = () => {};
const libheif = require('libheif-js/wasm-bundle');

function display(image, width, height) {
  return new Promise((resolve, reject) => {
    const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
    image.display(target, (out) => (out ? resolve(out.data) : reject(new Error('Не удалось раскодировать HEIF'))));
  });
}

parentPort.on('message', async ({ id, buffer }) => {
  const decoder = new libheif.HeifDecoder();
  let images = [];
  try {
    images = decoder.decode(new Uint8Array(buffer));
    if (!images.length) throw new Error('Файл HEIF повреждён или не содержит изображения');
    const image = images.find((img) => img.is_primary()) || images[0];
    const width = image.get_width();
    const height = image.get_height();
    const data = await display(image, width, height);
    parentPort.postMessage({ id, width, height, alpha: image.has_alpha_channel(), data: data.buffer }, [data.buffer]);
  } catch (error) {
    parentPort.postMessage({ id, error: error.message || String(error) });
  } finally {
    for (const img of images) img.free();
    if (decoder.decoder) libheif.heif_context_free(decoder.decoder);
  }
});
