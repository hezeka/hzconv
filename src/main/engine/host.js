// src/main/engine/host.js
// Связь главного процесса с фоновым процессом обработки: вызовы, события, перезапуск.
const path = require('path');
const EventEmitter = require('events');
const { utilityProcess } = require('electron');
const logger = require('../utils/logger');

const LONG = new Set(['convert', 'batchStart']);

class EngineHost extends EventEmitter {
  constructor({ logFile } = {}) {
    super();
    this.logFile = logFile;
    this.child = null;
    this.pending = new Map();
    this.seq = 0;
    this.longRunning = 0;
  }

  get busy() {
    return this.longRunning > 0;
  }

  spawn() {
    if (this.child) return this.child;
    const child = utilityProcess.fork(path.join(__dirname, 'worker.js'), [], {
      serviceName: 'Hzconv — обработка',
      env: { ...process.env, HZCONV_LOG: this.logFile || '' }
    });
    child.on('message', (msg) => this.onMessage(msg));
    child.on('exit', (code) => this.onExit(child, code));
    this.child = child;
    return child;
  }

  onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'event') {
      this.emit('event', msg.channel, msg.payload);
    } else if (msg.type === 'result') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (LONG.has(p.method)) this.longRunning--;
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    }
  }

  onExit(child, code) {
    if (this.child !== child) return;
    this.child = null;
    const crashed = this.pending.size > 0;
    if (crashed) logger.error(`Процесс обработки завершился аварийно (код ${code})`);
    for (const p of this.pending.values()) {
      p.reject(new Error('Процесс обработки аварийно завершился. Запустите ещё раз — готовые файлы будут пропущены, если выбрано «Обновить, если исходник изменился»'));
    }
    this.pending.clear();
    this.longRunning = 0;
    if (crashed) this.emit('crash', code);
  }

  call(method, ...args) {
    const child = this.spawn();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      if (LONG.has(method)) this.longRunning++;
      child.postMessage({ id, method, args });
    });
  }

  // Отмена не должна поднимать процесс, если он не запущен.
  cancel() {
    if (!this.child) return false;
    this.child.postMessage({ id: ++this.seq, method: 'cancel', args: [] });
    return true;
  }

  kill() {
    if (this.child) this.child.kill();
  }
}

module.exports = { EngineHost };
