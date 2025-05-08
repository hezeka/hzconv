// src/main/convertionController.js
const EventEmitter = require('events');

class ConversionController extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }
  
  reset() {
    this.isConverting = false;
    this.shouldCancel = false;
    this.progress = {
      current: 0,
      total: 0,
      files: new Map() // Хранение прогресса по каждому файлу
    };
  }
  
  startConversion(total) {
    this.reset();
    console.log(total)
    this.isConverting = true;
    this.shouldCancel = false;
    this.progress.total = total;
    this.emit('start', { total });
    return this;
  }
  
  updateFileProgress(filePath, progress) {
    if (!this.isConverting) return;
    
    this.progress.files.set(filePath, progress);
    this.emit('file-progress', { filePath, progress });
  }
  
  fileCompleted(filePath, result) {
    if (!this.isConverting) return;
    
    this.progress.current += 1;
    this.progress.files.set(filePath, 1);
    
    const totalProgress = this.progress.current / this.progress.total;
    this.emit('progress', { 
      current: this.progress.current, 
      total: this.progress.total,
      percentage: totalProgress
    });
    
    this.emit('file-complete', { filePath, result });
  }
  
  cancelConversion() {
    if (!this.isConverting) return false;
    
    this.shouldCancel = true;
    this.emit('cancel-requested');
    return true;
  }
  
  isConversionCancelled() {
    return this.shouldCancel;
  }
  
  finishConversion(results) {
    const wasCancelled = this.shouldCancel;
    this.isConverting = false;
    this.shouldCancel = false;
    
    this.emit('complete', { 
      results,
      cancelled: wasCancelled,
      processed: this.progress.current,
      total: this.progress.total
    });
    
    return { wasCancelled };
  }
  
  getStatus() {
    return {
      isConverting: this.isConverting,
      isCancelled: this.shouldCancel,
      progress: {
        current: this.progress.current,
        total: this.progress.total,
        percentage: this.progress.total > 0 
          ? this.progress.current / this.progress.total 
          : 0
      }
    };
  }
}

// Создаем единый экземпляр для использования во всем приложении
const conversionController = new ConversionController();

module.exports = conversionController;
