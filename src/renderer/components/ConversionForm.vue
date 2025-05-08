<template>
  <div class="conversion-form">
    <!-- <h3>Настройки конвертации</h3> -->
    
    <div v-if="files.length > 0" class="selected-files">
      <div class="files-header">
        <div>Выбранные файлы ({{ files.length }})</div>
        <el-button link size="small" @click="$emit('clear-files')">
          Очистить все
        </el-button>
      </div>
      
      <el-scrollbar max-height="150px">
        <div 
          v-for="(file, index) in files" 
          :key="index" 
          class="file-item"
        >
          <div class="file-name">{{ getFileName(file) }}</div>
          <el-button 
            type="" 
            size="small"
            @click="$emit('remove-file', index)"
          >
            Убрать
          </el-button>
        </div>
      </el-scrollbar>
    </div>
    
    <el-form 
      ref="formRef" 
      :model="formData" 
      label-width="160px" 
      class="settings-form"
    >
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
    </el-form>
    
    <div class="form-actions">
      <el-button 
        type="primary" 
        :disabled="files.length === 0 || !formData.format"
        @click="startConversion"
      >
        Начать конвертацию
      </el-button>
    </div>
  </div>
</template>

<script>
import { ref, reactive } from 'vue';
import { Delete } from '@element-plus/icons-vue';

export default {
  components: {
    Delete
  },
  props: {
    files: {
      type: Array,
      default: () => []
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
  emits: ['remove-file', 'clear-files', 'start-conversion'],
  setup(props, { emit }) {
    const formRef = ref(null);
    
    // Форма с настройками конвертации
    const formData = reactive({
      format: '',
      quality: 'medium',
      saveOption: 'original',
      subDir: 'converted',
      outputDir: '',
      prefix: '',
      overwritePolicy: 'rename'
    });
    
    // Выбор директории сохранения
    const selectOutputDir = async () => {
      try {
        const dirPath = await window.electronAPI.openDirectoryDialog();
        
        if (dirPath) {
          formData.outputDir = dirPath;
        }
      } catch (error) {
        console.error('Ошибка при выборе директории:', error);
      }
    };
    
    // Начать конвертацию
    const startConversion = () => {
      // Готовим опции конвертации
      const options = {
        format: formData.format,
        quality: formData.quality,
        overwritePolicy: formData.overwritePolicy,
        prefix: formData.prefix
      };
      
      // Устанавливаем директорию в зависимости от выбора
      if (formData.saveOption === 'subdir') {
        options.subDir = formData.subDir;
      } else if (formData.saveOption === 'custom' && formData.outputDir) {
        options.outputDir = formData.outputDir;
      }
      
      emit('start-conversion', options);
    };
    
    // Вспомогательные функции
    const getFileName = (filePath) => {
      return filePath.split(/[\/\\]/).pop();
    };
    
    return {
      formRef,
      formData,
      selectOutputDir,
      startConversion,
      getFileName
    };
  }
};
</script>

<style scoped>
.conversion-form {
  margin-top: 20px;
}

.selected-files {
  margin-bottom: 20px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 15px;
  border-bottom: 1px solid #ebeef5;
}

.file-item:last-child {
  border-bottom: none;
}

.file-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 10px;
}

.settings-form {
  margin-top: 20px;
}

.dir-selector {
  display: flex;
  align-items: center;
}

.dir-selector .el-input {
  margin-right: 10px;
  flex: 1;
}

.form-actions {
  margin-top: 20px;
  text-align: right;
}
</style>
