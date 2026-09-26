// src/main/engine/worker.js
// Фоновый процесс обработки (Electron utilityProcess). Здесь работают sharp и ffmpeg:
// если нативный код упадёт, окно приложения останется живым, а процесс перезапустится.
const logger = require('../utils/logger');
if (process.env.HZCONV_LOG) logger.setFile(process.env.HZCONV_LOG);

const inspect = require('../inspect');
const { Runner, estimate } = require('../runner');
const { BatchController, scan, previewOutput } = require('../batch');

const port = process.parentPort;
const emit = (channel, payload) => port.postMessage({ type: 'event', channel, payload });

const runner = new Runner();
const batch = new BatchController(runner, emit);

// В пакетном режиме события по файлам не пересылаются — только сводный прогресс.
runner.on('progress', (list) => !batch.active && emit('convert:progress', list));
runner.on('item', (event) => !batch.active && emit('convert:item', event));

const methods = {
  inspect: (paths) => inspect.inspect(paths),
  details: (filePath) => inspect.details(filePath),
  preview: (filePath, opts) => inspect.preview(filePath, opts),
  estimate: (item, settings) => estimate(item, settings),
  convert: (items, settings) => runner.start(items, settings),
  cancel: () => runner.cancel(),
  batchScan: (source, settings) => scan(source, settings),
  batchStart: (params) => batch.start(params),
  previewOutput: (item, settings) => previewOutput(item, settings)
};

port.on('message', async (e) => {
  const { id, method, args } = e.data || {};
  const fn = methods[method];
  try {
    if (!fn) throw new Error(`Неизвестная команда: ${method}`);
    const result = await fn(...(args || []));
    port.postMessage({ type: 'result', id, result });
  } catch (error) {
    port.postMessage({ type: 'result', id, error: String(error?.message || error) });
  }
});

process.on('uncaughtException', (error) => logger.error('Необработанная ошибка в процессе обработки', error.stack || error.message));
process.on('unhandledRejection', (error) => logger.error('Необработанный отказ в процессе обработки', String(error?.stack || error)));

port.postMessage({ type: 'ready' });
