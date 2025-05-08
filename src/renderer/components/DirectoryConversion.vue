<template>
    <div class="directory-conversion">
      <h3>Конвертация директории</h3>
      
      <el-form v-if="!isConverting" :model="formData" label-width="160px" class="settings-form">
        <!-- Выбор директории -->
        <el-form-item label="Выбрать директорию">
          <div class="dir-selector">
            <el-input v-model="formData.dirPath" placeholder="Выберите директорию" readonly />
            <el-button @click="selectDirectory">Выбрать</el-button>
          </div>
        </el-form-item>
        
        <!-- Вложенные опции -->
        <el-form-item label="Опции поиска">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-checkbox v-model="formData.recursive">Включая подпапки</el-checkbox>
            </el-col>
            <el-col :span="12">
              <el-checkbox v-model="formData.preserveSubfolders">Сохранять структуру папок</el-checkbox>
            </el-col>
          </el-row>
        </el-form-item>
        
        <!-- Формат конвертации -->
        <el-form-item label="Формат конвертации" prop="format">
          <el-select 
            v-model="formData.format" 
            placeholder="Выберите формат"
            style="width: 100%"
          >
            <el-option-group label="Изображения">
              <el-option 
                v-for="format in supportedFormats.image" 
                :key="format" 
                :label="format.toUpperCase()" 
                :value="format"
              />
            </el-option-group>
            
            <el-option-group label="Видео">
              <el-option 
                v-for="format in supportedFormats.video" 
                :key="format" 
                :label="format.toUpperCase()" 
                :value="format"
              />
            </el-option-group>
            
            <el-option-group label="Аудио">
              <el-option 
                v-for="format in supportedFormats.audio" 
                :key="format" 
                :label="format.toUpperCase()" 
                :value="format"
              />
            </el-option-group>
          </el-select>
        </el-form-item>
        
        <!-- Качество -->
        <el-form-item label="Качество" prop="quality">
          <el-select 
            v-model="formData.quality" 
            placeholder="Выберите качество"
            style="width: 100%"
          >
            <el-option label="Низкое" value="low" />
            <el-option label="Среднее" value="medium" />
            <el-option label="Высокое" value="high" />
          </el-select>
        </el-form-item>
        
        <!-- Директория сохранения -->
        <el-form-item label="Директория сохранения" prop="saveOption">
          <el-radio-group v-model="formData.saveOption">
            <el-radio value="original">В исходной папке</el-radio>
            <el-radio value="subdir">В подпапке</el-radio>
            <el-radio value="custom">Выбрать папку</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <!-- Поддиректория (если выбрана опция subdir) -->
        <el-form-item 
          v-if="formData.saveOption === 'subdir'" 
          label="Имя подпапки" 
          prop="subDir"
        >
          <el-input v-model="formData.subDir" placeholder="converted" />
        </el-form-item>
        
        <!-- Выбор папки (если выбрана опция custom) -->
        <el-form-item 
          v-if="formData.saveOption === 'custom'" 
          label="Выбрать папку" 
          prop="outputDir"
        >
          <div class="dir-selector">
            <el-input 
              v-model="formData.outputDir" 
              placeholder="Путь к папке сохранения" 
              readonly
            />
            <el-button @click="selectOutputDir">Выбрать</el-button>
          </div>
        </el-form-item>
        
        <!-- Префикс имени файла -->
        <el-form-item label="Префикс файла" prop="prefix">
          <el-input v-model="formData.prefix" placeholder="Префикс (опционально)" />
        </el-form-item>
        
        <!-- Политика перезаписи -->
        <el-form-item label="При совпадении имен" prop="overwritePolicy">
          <el-radio-group v-model="formData.overwritePolicy">
            <el-radio value="overwrite">Перезаписать</el-radio>
            <el-radio value="rename">Переименовать</el-radio>
            <el-radio value="skip">Пропустить</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <!-- Фильтр файлов -->
        <el-form-item label="Фильтр форматов" prop="formatFilter">
          <el-input 
            v-model="formData.formatFilter" 
            placeholder="Введите форматы через запятую (jpg, png) или оставьте пустым для всех"
          />
          <span class="form-hint">Оставьте пустым, чтобы обработать все поддерживаемые форматы</span>
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            :disabled="!formData.dirPath || !formData.format"
            @click="startConversion"
          >
            Начать конвертацию директории
          </el-button>
        </el-form-item>
      </el-form>
      
      <!-- Отображение прогресса конвертации директории -->
      <div v-if="isConverting" class="directory-progress">
        <h4>Конвертация директории</h4>
        
        <div class="progress-info">
          <div>Обработано файлов: {{ directoryProgress.currentFile }} из {{ directoryProgress.totalFiles }}</div>
          <div v-if="directoryProgress.currentFilePath" class="current-file">
            Текущий файл: {{ getFileName(directoryProgress.currentFilePath) }}
          </div>
        </div>
        
        <el-progress 
          :percentage="calculateProgress()" 
          :format="progressFormat"
        />
        
        <div class="progress-actions">
          <el-button type="danger" @click="cancelConversion">
            Отменить конвертацию
          </el-button>
        </div>
      </div>
      
      <!-- Отображение статистики директории, если директория выбрана -->
      <div v-if="!isConverting && directoryStats.totalFiles > 0" class="directory-stats">
        <el-alert
          type="info"
          :title="`Найдено ${directoryStats.totalFiles} файлов для конвертации`"
          show-icon
        />
      </div>
    </div>
  </template>
  
  <script>
  import { ref, reactive, watch, computed } from 'vue';
  import { ElMessage } from 'element-plus';
  
  export default {
    props: {
      isConverting: {
        type: Boolean,
        default: false
      },
      supportedFormats: {
        type: Object,
        default: () => ({
          image: [],
          video: [],
          audio: []
        })
      }
    },
    
    emits: ['conversion-start', 'conversion-complete', 'conversion-cancel'],
    
    setup(props, { emit }) {
      const formData = reactive({
        dirPath: '',
        recursive: true,
        preserveSubfolders: true,
        format: '',
        quality: 'medium',
        saveOption: 'original',
        subDir: 'converted',
        outputDir: '',
        prefix: '',
        overwritePolicy: 'rename',
        formatFilter: ''
      });
      
      const directoryStats = reactive({
        totalFiles: 0
      });
      
      const directoryProgress = reactive({
        currentFile: 0,
        totalFiles: 0,
        currentFilePath: ''
      });
      
      const isConversionCancelled = ref(false);
      
      // Форматирование прогресса
      const progressFormat = (percentage) => {
        return `${percentage}%`;
      };
      
      // Расчет процента прогресса
      const calculateProgress = () => {
        if (directoryProgress.totalFiles === 0) return 0;
        return Math.floor((directoryProgress.currentFile / directoryProgress.totalFiles) * 100);
      };
      
      // Выбор директории для конвертации
      const selectDirectory = async () => {
        try {
          const dirPath = await window.electronAPI.openDirectoryDialog();
          
          if (dirPath) {
            formData.dirPath = dirPath;
            await analyzeDirectory();
          }
        } catch (error) {
          console.error('Ошибка при выборе директории:', error);
          ElMessage.error('Не удалось выбрать директорию');
        }
      };
      
      // Выбор директории для сохранения
      const selectOutputDir = async () => {
        try {
          const dirPath = await window.electronAPI.openDirectoryDialog();
          
          if (dirPath) {
            formData.outputDir = dirPath;
          }
        } catch (error) {
          console.error('Ошибка при выборе директории сохранения:', error);
          ElMessage.error('Не удалось выбрать директорию сохранения');
        }
      };
      
      // Анализ директории для отображения статистики
      const analyzeDirectory = async () => {
        if (!formData.dirPath) return;
        
        try {
          // Получаем форматы для фильтрации
          const formats = getFormatsFromFilter();
          
          // Получаем список файлов из директории для статистики
          const files = await window.electronAPI.getFilesFromDirectory({
            dirPath: formData.dirPath,
            formats,
            recursive: formData.recursive
          });
          
          directoryStats.totalFiles = files.length;
          
          if (files.length === 0) {
            ElMessage.warning('В выбранной директории не найдено подходящих файлов');
          }
        } catch (error) {
          console.error('Ошибка при анализе директории:', error);
          ElMessage.error('Не удалось проанализировать директорию');
        }
      };
      
      // Получение списка форматов из поля фильтра
      const getFormatsFromFilter = () => {
        if (!formData.formatFilter.trim()) {
          // Если фильтр пустой, используем все поддерживаемые форматы
          return [];
        }
        
        // Разбиваем строку на массив форматов
        return formData.formatFilter
          .split(',')
          .map(format => format.trim().toLowerCase())
          .filter(format => format); // Удаляем пустые элементы
      };
      
      // Начать конвертацию директории
      const startConversion = async () => {
        if (!formData.dirPath) {
          ElMessage.warning('Выберите директорию для конвертации');
          return;
        }
        
        if (!formData.format) {
          ElMessage.warning('Выберите формат для конвертации');
          return;
        }
        
        try {
          // Получаем форматы для фильтрации
          const formats = getFormatsFromFilter();
          
          // Готовим опции для конвертации
          const options = {
            format: formData.format,
            quality: formData.quality,
            overwritePolicy: formData.overwritePolicy,
            prefix: formData.prefix,
            preserveSubfolders: formData.preserveSubfolders
          };
          
          // Устанавливаем директорию в зависимости от выбора
          if (formData.saveOption === 'subdir') {
            options.subDir = formData.subDir;
          } else if (formData.saveOption === 'custom' && formData.outputDir) {
            options.outputDir = formData.outputDir;
          }
          
          // Сбрасываем состояние отмены
          isConversionCancelled.value = false;
          
          // Сообщаем о начале конвертации
          emit('conversion-start');
          
          // Настраиваем прием событий прогресса
          window.electronAPI.onDirectoryConversionProgress((data) => {
            directoryProgress.currentFile = data.currentFile;
            directoryProgress.totalFiles = data.totalFiles;
            directoryProgress.currentFilePath = data.filePath;
          });
          
          // Запускаем конвертацию директории
          const result = await window.electronAPI.convertDirectory({
            dirPath: formData.dirPath,
            formats,
            options,
            recursive: formData.recursive
          });
          
          // Очищаем слушатель событий
          window.electronAPI.removeAllListeners();
          
          // Обрабатываем результат
          if (isConversionCancelled.value) {
            ElMessage.warning('Конвертация была отменена пользователем');
          } else if (result.success) {
            ElMessage.success(`Конвертация завершена: ${result.successCount} из ${result.totalFiles} файлов`);
          } else {
            ElMessage.error(`Ошибка при конвертации директории: ${result.error || 'Неизвестная ошибка'}`);
          }
          
          // Сообщаем о завершении
          emit('conversion-complete', result);
        } catch (error) {
          console.error('Ошибка при конвертации директории:', error);
          ElMessage.error('Ошибка при конвертации директории');
          emit('conversion-complete', { success: false, error: error.message });
        }
      };
      
      // Отмена конвертации
      const cancelConversion = () => {
        isConversionCancelled.value = true;
        emit('conversion-cancel');
      };
      
      // Следим за изменениями параметров директории для обновления статистики
      watch([
        () => formData.dirPath,
        () => formData.recursive,
        () => formData.formatFilter
      ], async () => {
        if (formData.dirPath) {
          await analyzeDirectory();
        }
      });
      
      // Вспомогательные функции
      const getFileName = (filePath) => {
        if (!filePath) return '';
        return filePath.split(/[\/\\]/).pop();
      };
      
      return {
        formData,
        directoryStats,
        directoryProgress,
        isConversionCancelled,
        selectDirectory,
        selectOutputDir,
        startConversion,
        cancelConversion,
        calculateProgress,
        progressFormat,
        getFileName
      };
    }
  };
  </script>
  
  <style scoped>
  .directory-conversion {
    margin-top: 10px;
  }
  
  .dir-selector {
    display: flex;
    align-items: center;
  }
  
  .dir-selector .el-input {
    margin-right: 10px;
    flex: 1;
  }
  
  .settings-form {
    margin-top: 20px;
  }
  
  .form-hint {
    display: block;
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
  }
  
  .directory-stats {
    margin-top: 15px;
  }
  
  .directory-progress {
    margin-top: 20px;
    padding: 20px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background-color: #f8f8f8;
  }
  
  .progress-info {
    margin-bottom: 15px;
  }
  
  .current-file {
    margin-top: 5px;
    font-size: 14px;
    color: #606266;
    word-break: break-all;
  }
  
  .progress-actions {
    margin-top: 20px;
    text-align: center;
  }
  </style>
  