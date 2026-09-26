<template>
    <div class="directory-conversion">
      <!-- <h3>Конвертация директории</h3> -->
      
      <el-form v-if="!isConverting" :model="formData" label-width="160px" class="settings-form">
        <!-- Выбор директории -->
        <el-form-item label="Путь">
          <div class="dir-selector">
            <el-input v-model="formData.dirPath" placeholder="Выберите директорию" />
            <el-button @click="selectDirectory">Выбрать</el-button>
          </div>
        </el-form-item>
        
        <!-- Вложенные опции -->
        <el-form-item label="Опции">
          <el-row :gutter="20">
            <el-col>
              <el-checkbox v-model="formData.recursive">Включая подпапки</el-checkbox>
              <el-checkbox v-model="formData.preserveSubfolders">Сохранять структуру папок</el-checkbox>
            </el-col>
          </el-row>
          <el-button
            v-if="formData.recursive && formData.dirPath"
            size="small"
            style="margin-top: 8px"
            :loading="isLoadingSubfolders"
            :disabled="isLoadingSubfolders || availableSubfolders.length === 0"
            @click="openSubfolderDialog"
          >
            <span v-if="isLoadingSubfolders">Анализ папок...</span>
            <span v-else>
              {{ selectedSubfolders.length > 0 ? 'Изменить подпапки' : 'Выбрать подпапки' }}
              <span v-if="selectedSubfolders.length > 0" class="subfolder-count">
                ({{ selectedSubfolders.length }})
              </span>
            </span>
          </el-button>
        </el-form-item>
        
        <!-- Фильтр файлов -->
        <el-form-item label="Фильтр форматов" prop="formatFilter">
          <el-input 
            v-model="formData.formatFilter" 
            placeholder="Введите форматы через запятую (jpg, png) или оставьте пустым для всех"
          />
          <span class="form-hint">Оставьте пустым, чтобы обработать все поддерживаемые форматы</span>
        </el-form-item>
        
        <!-- Формат конвертации -->
        <el-form-item label="Формат" prop="format">
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
        <el-form-item label="Сохранить" prop="saveOption">
          <el-select 
            v-model="formData.saveOption"
            placeholder="Путь сохранения"
            style="width: 100%"
          >
            <el-option label="В исходной папке" value="original" />
            <el-option label="В подпапке" value="subdir" />
            <el-option label="Выбрать папку" value="custom" />
          </el-select>
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
              placeholder="Путь сохранения"
            />
            <el-button @click="selectOutputDir">Выбрать</el-button>
          </div>
        </el-form-item>
        
        <!-- Префикс имени файла -->
        <el-form-item label="Префикс файла" prop="prefix">
          <el-input v-model="formData.prefix" placeholder="Например, conv_" />
        </el-form-item>
        
        <!-- Политика перезаписи -->
        <el-form-item label="При конфликте" prop="overwritePolicy">
          <el-select v-model="formData.overwritePolicy" placeholder="Выберите политику">
            <el-option value="overwrite" label="Перезаписать"></el-option>
            <el-option value="rename" label="Переименовать"></el-option>
            <el-option value="skip" label="Пропустить"></el-option>
          </el-select>
        </el-form-item>
        
        <div class="form-actions">
          <el-button @click="resetForm">
            Сбросить
          </el-button>
          <el-button
            type="primary"
            :disabled="!formData.dirPath || !formData.format"
            @click="startConversion"
          >
            Начать конвертацию директории
          </el-button>
        </div>
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
          :duration="0"
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

      <!-- Диалог выбора подпапок -->
      <el-dialog
        v-model="subfolderDialogVisible"
        title="Выбор подпапок"
        width="500px"
      >
        <div class="subfolder-dialog-content">
          <!-- Поле поиска -->
          <el-input
            v-model="subfolderSearchQuery"
            placeholder="Введите название папки. Используйте * как подстановочный знак"
            clearable
            class="subfolder-search"
          >
            <template #prefix>
              <span style="    color: rgb(144 147 153 / 47%);font-size: 18px;transform: translateY(-1px);">⌕</span>
            </template>
          </el-input>

          <div class="subfolder-master">
            <el-checkbox
              v-model="allSubfoldersSelected"
              :indeterminate="isIndeterminate"
              @change="handleSelectAll"
            >
              Выбрать все ({{ filteredSubfolders.length }})
            </el-checkbox>
          </div>

          <div v-if="filteredSubfolders.length === 0" class="no-results">
            Папки не найдены
          </div>

          <el-scrollbar v-else max-height="300px">
            <el-checkbox-group v-model="selectedSubfolders" class="subfolder-list">
              <div
                v-for="folder in filteredSubfolders"
                :key="folder.path"
                class="subfolder-item"
                :style="{ paddingLeft: (folder.depth * 16) + 'px' }"
              >
                <el-checkbox :value="folder.path">
                  {{ folder.name }}
                </el-checkbox>
              </div>
            </el-checkbox-group>
          </el-scrollbar>
        </div>
        <template #footer>
          <el-button @click="clearSubfolderSelection">Сбросить выбор</el-button>
          <el-button type="primary" @click="subfolderDialogVisible = false">Готово</el-button>
        </template>
      </el-dialog>
    </div>
  </template>
  
  <script>
  import { ref, reactive, watch, computed, onMounted } from 'vue';
  import { ElMessage } from 'element-plus';

  const STORAGE_KEY = 'directoryConversion_settings';
  const DEFAULT_FORM_DATA = {
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
  };
  
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
      const formData = reactive({ ...DEFAULT_FORM_DATA });

      const directoryStats = reactive({
        totalFiles: 0
      });

      const directoryProgress = reactive({
        currentFile: 0,
        totalFiles: 0,
        currentFilePath: ''
      });

      const isConversionCancelled = ref(false);

      // Состояние для выбора подпапок (НЕ сохраняется в localStorage)
      const availableSubfolders = ref([]);
      const selectedSubfolders = ref([]);
      const subfolderDialogVisible = ref(false);
      const isLoadingSubfolders = ref(false);
      const subfolderSearchQuery = ref('');

      // Computed для мастер-чекбокса
      const allSubfoldersSelected = computed({
        get: () => availableSubfolders.value.length > 0 &&
                   selectedSubfolders.value.length === availableSubfolders.value.length,
        set: () => {}
      });

      const isIndeterminate = computed(() =>
        selectedSubfolders.value.length > 0 &&
        selectedSubfolders.value.length < availableSubfolders.value.length
      );

      // Функция для поиска папок
      const matchesPattern = (text, pattern) => {
        // Если в паттерне нет звёздочки, ищем просто подстроку (нечувствительно к регистру)
        if (!pattern.includes('*')) {
          return text.toLowerCase().includes(pattern.toLowerCase());
        }

        // Если есть звёздочка, используем регулярное выражение
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped.replace(/\*/g, '.*'), 'i');
        return regex.test(text);
      };

      // Фильтрованный список подпапок
      const filteredSubfolders = computed(() => {
        if (!subfolderSearchQuery.value.trim()) {
          return availableSubfolders.value;
        }

        const query = subfolderSearchQuery.value.trim();

        return availableSubfolders.value.filter(folder => {
          // Ищем в названии папки или в полном пути
          return matchesPattern(folder.name, query) || matchesPattern(folder.relativePath, query);
        });
      });

      // Защита от спама ошибок
      const lastErrorMessage = ref('');
      const lastErrorTime = ref(0);
      const analyzeDebounceTimer = ref(null);

      const showError = (message) => {
        const now = Date.now();
        // Не показываем ту же ошибку если прошло меньше 3 секунд
        if (message === lastErrorMessage.value && now - lastErrorTime.value < 3000) {
          return;
        }
        lastErrorMessage.value = message;
        lastErrorTime.value = now;
        ElMessage.error(message);
      };

      // Загрузка сохранённых настроек из localStorage
      const loadSavedSettings = async () => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(formData, parsed);

            // Если была выбрана директория и включены подпапки - загружаем их
            if (formData.dirPath && formData.recursive) {
              await loadSubfolders();
            }
          }
        } catch (error) {
          console.error('Ошибка загрузки настроек:', error);
        }
      };

      // Сохранение настроек в localStorage
      const saveSettings = () => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        } catch (error) {
          console.error('Ошибка сохранения настроек:', error);
        }
      };

      // Сброс настроек к стандартным
      const resetForm = () => {
        Object.assign(formData, DEFAULT_FORM_DATA);
        localStorage.removeItem(STORAGE_KEY);
        directoryStats.totalFiles = 0;
        availableSubfolders.value = [];
        selectedSubfolders.value = [];
      };

      // Загрузка подпапок
      const loadSubfolders = async () => {
        if (!formData.dirPath || !formData.recursive) {
          availableSubfolders.value = [];
          selectedSubfolders.value = [];
          return;
        }

        try {
          isLoadingSubfolders.value = true;

          // Устанавливаем таймаут на 60 секунд для больших директорий
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 60000)
          );

          const subfolders = await Promise.race([
            window.electronAPI.getSubfolders({
              dirPath: formData.dirPath,
              recursive: true
            }),
            timeoutPromise
          ]);

          // Добавляем виртуальную папку для корневых файлов
          availableSubfolders.value = [
            {
              path: formData.dirPath,
              name: '📁 Файлы в корне',
              relativePath: '',
              depth: 0,
              fileCount: 0,
              isRoot: true
            },
            ...subfolders
          ];

          // Сбрасываем выбор при загрузке новых подпапок
          selectedSubfolders.value = [];
        } catch (error) {
          console.error('Ошибка загрузки подпапок:', error);
          availableSubfolders.value = [];

          if (error.message === 'timeout') {
            showError('Анализ папок занял слишком долго. Возможно, в директории очень много папок');
          } else {
            showError('Не удалось загрузить список подпапок');
          }
        } finally {
          isLoadingSubfolders.value = false;
        }
      };

      // Открытие диалога выбора подпапок
      const openSubfolderDialog = () => {
        subfolderSearchQuery.value = ''; // Очищаем строку поиска при открытии
        subfolderDialogVisible.value = true;
      };

      // Выбор/снятие всех подпапок
      const handleSelectAll = (val) => {
        if (val) {
          selectedSubfolders.value = availableSubfolders.value.map(f => f.path);
        } else {
          selectedSubfolders.value = [];
        }
      };

      // Сброс выбора подпапок (будут конвертироваться все)
      const clearSubfolderSelection = () => {
        selectedSubfolders.value = [];
      };

      // Автосохранение при изменении любого поля
      watch(formData, saveSettings, { deep: true });

      // Загрузка настроек при монтировании
      onMounted(async () => {
        await loadSavedSettings();
        // Не вызываем анализ при загрузке - подождём пока пользователь выберет опции
        // Анализ будет вызван через watch при изменении параметров
      });
      
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
            await loadSubfolders();
            await analyzeDirectoryInternal(); // Напрямую без дебаунса
          }
        } catch (error) {
          console.error('Ошибка при выборе директории:', error);
          showError('Не удалось выбрать директорию');
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
          showError('Не удалось выбрать директорию сохранения');
        }
      };
      
      // Анализ директории для отображения статистики (внутренняя функция)
      const analyzeDirectoryInternal = async () => {
        if (!formData.dirPath) return;

        try {
          // Получаем форматы для фильтрации
          const formats = getFormatsFromFilter();

          // Получаем список файлов из директории для статистики
          const files = await window.electronAPI.getFilesFromDirectory({
            dirPath: formData.dirPath,
            formats,
            recursive: formData.recursive,
            selectedSubfolders: [...selectedSubfolders.value] // Копируем массив
          });

          directoryStats.totalFiles = files.length;
          // Сбрасываем ошибку при успехе
          lastErrorMessage.value = '';
        } catch (error) {
          console.error('Ошибка при анализе директории:', error);
          showError('Не удалось проанализировать директорию');
        }
      };

      // Дебаунсированная версия analyzeDirectory
      const analyzeDirectory = () => {
        if (analyzeDebounceTimer.value) {
          clearTimeout(analyzeDebounceTimer.value);
        }
        analyzeDebounceTimer.value = setTimeout(() => {
          analyzeDirectoryInternal();
        }, 300);
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
          // ВАЖНО: Сначала очищаем прогресс
          directoryProgress.currentFile = 0;
          directoryProgress.totalFiles = 0;
          directoryProgress.currentFilePath = '';

          // Ждем следующий тик, чтобы DOM обновился
          await new Promise(resolve => setTimeout(resolve, 0));

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
            recursive: formData.recursive,
            selectedSubfolders: [...selectedSubfolders.value] // Копируем массив
          });

          // Очищаем слушатель событий
          window.electronAPI.removeAllListeners();

          // Обрабатываем результат
          if (isConversionCancelled.value || result.cancelledCount > 0) {
            ElMessage.warning('Конвертация была отменена пользователем');
          } else if (result.success) {
            const message = `Конвертация завершена: ${result.successCount} успешно${result.errorCount > 0 ? `, ${result.errorCount} ошибок` : ''}`;
            ElMessage.success(message);
          } else {
            showError(`Ошибка при конвертации: ${result.error || 'Неизвестная ошибка'}`);
          }

          // Сообщаем о завершении
          emit('conversion-complete', result);
        } catch (error) {
          console.error('Ошибка при конвертации директории:', error);
          showError('Ошибка при конвертации директории');
          emit('conversion-complete', { success: false, error: error.message });
        }
      };

      // Отмена конвертации
      const cancelConversion = async () => {
        try {
          isConversionCancelled.value = true;
          await window.electronAPI.cancelConversion();
          ElMessage.warning('Запрос на отмену конвертации отправлен');
          emit('conversion-cancel');
        } catch (error) {
          console.error('Ошибка при отмене конвертации:', error);
          showError('Не удалось отменить конвертацию');
        }
      };
      
      // При изменении recursive перезагружаем подпапки
      watch(() => formData.recursive, async (newVal, oldVal) => {
        if (newVal === oldVal) return;
        if (newVal && formData.dirPath) {
          await loadSubfolders();
        } else {
          availableSubfolders.value = [];
          selectedSubfolders.value = [];
        }
        analyzeDirectory();
      });

      // Следим за изменениями параметров директории для обновления статистики
      watch(() => formData.formatFilter, () => {
        if (formData.dirPath) {
          analyzeDirectory();
        }
      });

      // При изменении выбранных подпапок пересчитываем статистику (с дебаунсом)
      watch(selectedSubfolders, () => {
        if (formData.dirPath) {
          analyzeDirectory();
        }
      }, { deep: true });
      
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
        availableSubfolders,
        selectedSubfolders,
        subfolderDialogVisible,
        isLoadingSubfolders,
        subfolderSearchQuery,
        filteredSubfolders,
        allSubfoldersSelected,
        isIndeterminate,
        selectDirectory,
        selectOutputDir,
        startConversion,
        cancelConversion,
        resetForm,
        openSubfolderDialog,
        handleSelectAll,
        clearSubfolderSelection,
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

  .form-actions {
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
  }

  .subfolder-count {
    color: #409eff;
    font-weight: 500;
  }

  .subfolder-dialog-content {
    min-height: 100px;
  }

  .subfolder-master {
    padding-bottom: 10px;
    border-bottom: 1px solid #ebeef5;
    margin-bottom: 10px;
  }

  .subfolder-list {
    display: flex;
    flex-direction: column;
  }

  .subfolder-item {
    padding: 6px 0;
  }

  .subfolder-search {
    margin-bottom: 12px;
  }

  .no-results {
    padding: 20px;
    text-align: center;
    color: #909399;
    font-size: 14px;
  }
  </style>
  