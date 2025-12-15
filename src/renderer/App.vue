<template>
  <div class="container">
    <el-card class="app-container">
      <div class="header">
        Hzconv
        <div style="-webkit-app-region: no-drag;" class="el-button" @click="close()">
          Закрыть
        </div>
      </div>
      <!-- <template #header>
        <div class="header">
          <h2>Конвертер медиафайлов</h2>
        </div>
      </template> -->
      
      <el-tabs v-model="activeTab">
        <el-tab-pane label="Отдельные файлы" name="files">
          <FileDropZone 
            :supportedFormats="supportedFormats" 
            @files-selected="handleFilesSelected"
          />
          
          <ConversionForm
            :files="selectedFiles"
            :supportedFormats="supportedFormats"
            :isConverting="isConverting"
            @start-conversion="startConversion"
            @remove-file="removeFile"
            @clear-files="clearFiles"
          />
        </el-tab-pane>
        
        <el-tab-pane label="Конвертация директории" name="directory">
          <DirectoryConversion
            :supportedFormats="supportedFormats"
            :isConverting="isDirectoryConverting"
            @conversion-start="startDirectoryConversion"
            @conversion-complete="completeDirectoryConversion"
            @conversion-cancel="cancelDirectoryConversion"
          />
        </el-tab-pane>
      </el-tabs>
      
      <!-- Прогресс конвертации файлов -->
      <div v-if="isConverting" class="progress-section">
        <h3>Прогресс конвертации</h3>

        <div v-for="(item, index) in conversionProgress" :key="index" class="file-progress">
          <div class="file-name">{{ getFileName(item.filePath) }}</div>
          <el-progress
            :percentage="Math.round(item.progress * 100)"
            :status="item.status === 'active' ? '' : item.status"
            :duration="0"
          />
        </div>

        <div class="total-progress">
          <div>Общий прогресс</div>
          <el-progress
            :percentage="Math.round(getTotalProgress() * 100)"
            :status="conversionStatus === 'active' ? '' : conversionStatus"
            :duration="0"
          />
        </div>

        <div class="progress-actions">
          <el-button type="danger" @click="cancelConversion">
            Отменить конвертацию
          </el-button>
        </div>
      </div>
      
      <!-- Результаты конвертации -->
      <div v-if="conversionResults.length > 0" class="results-section">
        <h3>Результаты</h3>
        
        <el-alert
          v-if="successCount > 0"
          type="success"
          :title="`Успешно конвертировано: ${successCount} файл(ов)`"
          show-icon
        />
        
        <el-alert
          v-if="errorCount > 0"
          type="error"
          :title="`Ошибок конвертации: ${errorCount} файл(ов)`"
          show-icon
        />
        
        <el-button 
          v-if="successCount > 0" 
          type="primary" 
          @click="clearResults" 
          size="small"
          style="margin-top: 10px;"
        >
          Очистить результаты
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style>
.header {
  -webkit-app-region: drag;
  margin: calc(var(--el-card-padding) * -1);
  padding: var(--el-card-padding);
  margin-bottom: 0;
  font-weight: 600;
  position: sticky;
  top: 0;
  background: #ffffff9e;
  backdrop-filter: blur(8px);
  z-index: 1000;
  border-bottom: 1px solid #f0f0f0;
}

body {
  margin: 0;
}
.container {
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  max-width: unset !important;
}

.el-card {
  /* border-radius: 0; */
  /* box-shadow: 0; */
  height: 100vh;
  box-sizing: border-box;
  overflow: auto;
}
/* @media screen and (max-width: 1000px) {
  body {
    margin: 0;
  }
  .container {
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .el-card {
    border-radius: 0;
    box-shadow: 0;
    height: 100vh;
    box-sizing: border-box;
    overflow: auto;
  }
} */

*::-webkit-scrollbar,
html *::-webkit-scrollbar {
  height: 4px;
  width: 4px;
}
*::-webkit-scrollbar-track,
html *::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, .1);
}
*::-webkit-scrollbar-thumb,
html *::-webkit-scrollbar-thumb {
  background-color: #6d6d6d80;
  border-radius: 5px;
  border: 3px solid rgba(0, 0, 0, 0);
}
  </style>

<script>
import { ref, onMounted, computed, onUnmounted } from 'vue';
import FileDropZone from './components/FileDropZone.vue';
import ConversionForm from './components/ConversionForm.vue';
import DirectoryConversion from './components/DirectoryConversion.vue';
import { ElMessage } from 'element-plus';

export default {
  components: {
    FileDropZone,
    ConversionForm,
    DirectoryConversion
  },
  
  setup() {
    const activeTab = ref('files');
    const supportedFormats = ref({
      image: [],
      video: [],
      audio: []
    });
    
    // Состояние конвертации файлов
    const selectedFiles = ref([]);
    const isConverting = ref(false);
    const conversionProgress = ref([]);
    const conversionResults = ref([]);
    const conversionStatus = ref('');
    
    // Состояние конвертации директории
    const isDirectoryConverting = ref(false);
    
    // Расчет статистики
const successCount = computed(() => {
  return conversionResults.value.reduce((total, result) => {
    // Если это результат директории, суммируем successCount
    if (result.isDirectory) {
      return total + (result.successCount || 0);
    }
    // Если это обычный файл и он успешен
    if (result.success) {
      return total + 1;
    }
    return total;
  }, 0);
});

const errorCount = computed(() => {
  return conversionResults.value.reduce((total, result) => {
    // Если это результат директории, суммируем errorCount
    if (result.isDirectory) {
      return total + (result.errorCount || 0);
    }
    // Если это обычный файл и он неуспешен (и не отменен)
    if (!result.success && !result.cancelled) {
      return total + 1;
    }
    return total;
  }, 0);
});

// Загрузка поддерживаемых форматов
const loadSupportedFormats = async () => {
  try {
    const formats = await window.electronAPI.getSupportedFormats();
    supportedFormats.value = formats;
  } catch (error) {
    console.error('Ошибка при получении поддерживаемых форматов:', error);
    ElMessage.error('Не удалось загрузить поддерживаемые форматы файлов');
  }
};

// Работа с отдельными файлами
const handleFilesSelected = (files) => {
  selectedFiles.value = [...selectedFiles.value, ...files];
};

const removeFile = (index) => {
  selectedFiles.value.splice(index, 1);
};

const clearFiles = () => {
  selectedFiles.value = [];
};

// Расчет общего прогресса
const getTotalProgress = () => {
  if (conversionProgress.value.length === 0) return 0;
  
  const totalProgress = conversionProgress.value
    .reduce((sum, item) => sum + item.progress, 0);
    
  return totalProgress / conversionProgress.value.length;
};

// Вспомогательные функции
const getFileName = (filePath) => {
  return filePath ? filePath.split(/[\/\\]/).pop() : '';
};

// Старт конвертации отдельных файлов
const startConversion = async (options) => {
  if (selectedFiles.value.length === 0) {
    ElMessage.warning('Выберите файлы для конвертации');
    return;
  }

  try {
    // ВАЖНО: Сначала очищаем предыдущие результаты и прогресс
    conversionResults.value = [];
    conversionProgress.value = [];

    // Ждем следующий тик, чтобы DOM обновился
    await new Promise(resolve => setTimeout(resolve, 0));

    // Инициализируем прогресс для каждого файла
    conversionProgress.value = selectedFiles.value.map(file => ({
      filePath: file,
      progress: 0,
      status: 'active'
    }));

    // Устанавливаем статус конвертации
    isConverting.value = true;
    conversionStatus.value = 'active';

    // Настраиваем обработчики событий
    window.electronAPI.onConversionProgress((data) => {
      const index = conversionProgress.value.findIndex(
        item => item.filePath === data.filePath
      );

      if (index !== -1) {
        conversionProgress.value[index].progress = data.progress;
      }
    });

    window.electronAPI.onConversionError((data) => {
      const index = conversionProgress.value.findIndex(
        item => item.filePath === data.filePath
      );

      if (index !== -1) {
        conversionProgress.value[index].status = 'exception';
      }
    });

    // Запускаем конвертацию
    const results = await window.electronAPI.convertFiles({
      files: selectedFiles.value.map(f => String(f)), // Преобразуем в простые строки
      options
    });

    // Очищаем старые результаты перед добавлением новых
    const newResults = [];

    // Обрабатываем результаты
    results.forEach(result => {
      // Обновляем статус в прогрессе
      const index = conversionProgress.value.findIndex(
        item => item.filePath === result.inputPath || item.filePath === result.filePath
      );

      if (index !== -1) {
        conversionProgress.value[index].status = result.success ? 'success' : 'exception';
        conversionProgress.value[index].progress = 1; // 100%
      }

      // Добавляем в результаты
      newResults.push({
        filePath: result.inputPath || result.filePath,
        outputPath: result.outputPath,
        success: result.success && !result.cancelled,
        error: result.error,
        cancelled: result.cancelled
      });
    });

    // Заменяем результаты
    conversionResults.value = newResults;

    // Обновляем общий статус
    conversionStatus.value = 'success';

    // Подсчитываем успешные и неуспешные конвертации
    const successfulCount = newResults.filter(r => r.success).length;
    const failedCount = newResults.filter(r => !r.success && !r.cancelled).length;
    const cancelledCount = newResults.filter(r => r.cancelled).length;

    // Выводим сообщение
    if (successfulCount > 0) {
      ElMessage.success(`Успешно конвертировано: ${successfulCount} файл(ов)`);
    }

    if (failedCount > 0) {
      ElMessage.error(`Ошибки при конвертации: ${failedCount} файл(ов)`);
    }

    if (cancelledCount > 0) {
      ElMessage.warning(`Отменено: ${cancelledCount} файл(ов)`);
    }
  } catch (error) {
    console.error('Ошибка при конвертации файлов:', error);
    ElMessage.error('Произошла ошибка при конвертации файлов');
    conversionStatus.value = 'exception';
  } finally {
    isConverting.value = false;
    // Удаляем слушатели событий
    window.electronAPI.removeAllListeners();
  }
};

// Отмена конвертации
const cancelConversion = async () => {
  try {
    await window.electronAPI.cancelConversion();
    ElMessage.warning('Запрос на отмену конвертации отправлен');
  } catch (error) {
    console.error('Ошибка при отмене конвертации:', error);
    ElMessage.error('Не удалось отменить конвертацию');
  }
};

// Очистка результатов
const clearResults = () => {
  conversionResults.value = [];
  conversionProgress.value = [];
};

// Работа с конвертацией директории
const startDirectoryConversion = () => {
  // Очищаем предыдущие результаты
  conversionResults.value = [];
  conversionProgress.value = [];

  isDirectoryConverting.value = true;
  // Активируем вкладку директории
  activeTab.value = 'directory';
};

const completeDirectoryConversion = (result) => {
  isDirectoryConverting.value = false;
  
  // Обновляем результаты
  if (result && (result.successCount > 0 || result.errorCount > 0)) {
    conversionResults.value.push({
      isDirectory: true,
      success: result.success,
      successCount: result.successCount || 0,
      errorCount: result.errorCount || 0,
      message: result.message || ''
    });
  }
};

const cancelDirectoryConversion = () => {
  isDirectoryConverting.value = false;
};

// Инициализация при монтировании
onMounted(async () => {
  await loadSupportedFormats();
});

// Убираем слушатели при размонтировании
onUnmounted(() => {
  window.electronAPI.removeAllListeners();
});

const close = () => {
  console.log('Closing')
  window.electronAPI.window('close');
}

return {
  activeTab,
  supportedFormats,
  selectedFiles,
  isConverting,
  isDirectoryConverting,
  conversionProgress,
  conversionResults,
  conversionStatus,
  handleFilesSelected,
  removeFile,
  clearFiles,
  startConversion,
  cancelConversion,
  getTotalProgress,
  getFileName,
  successCount,
  errorCount,
  clearResults,
  startDirectoryConversion,
  completeDirectoryConversion,
  cancelDirectoryConversion,
  close
};
}
};
</script>

<style>
.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.app-container {
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-section {
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid #e6e6e6;
}

.file-progress {
  margin-bottom: 10px;
}

.file-name {
  margin-bottom: 5px;
  font-size: 14px;
  color: #606266;
}

.total-progress {
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px dashed #e6e6e6;
}

.results-section {
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid #e6e6e6;
}

.progress-actions {
  margin-top: 20px;
  text-align: center;
}
</style>
