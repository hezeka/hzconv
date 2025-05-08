<template>
  <div 
    class="drop-zone"
    :class="{ 'active': isDragging }"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="drop-zone-content">
      <el-icon class="drop-icon"><Upload /></el-icon>
      <div class="drop-text">
        Перетащите файлы сюда или
        <br>
        <br>
        <el-button @click="openFileDialog">
          выберите файлы
        </el-button>
      </div>
      <!-- <div class="supported-formats">
        <small>
          Поддерживаемые форматы: 
          <span v-if="allFormats.length > 0">{{ allFormats.join(', ') }}</span>
        </small>
      </div> -->
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

export default {
  components: {
    Upload
  },
  props: {
    supportedFormats: {
      type: Object,
      default: () => ({
        image: [],
        video: [],
        audio: []
      })
    }
  },
  setup(props, { emit }) {
    const isDragging = ref(false);
    
    // Вычисляем все форматы для отображения
    const allFormats = computed(() => {
      return [
        ...props.supportedFormats.image,
        ...props.supportedFormats.video,
        ...props.supportedFormats.audio
      ];
    });
    
    // Обработчики событий перетаскивания
    const onDragOver = () => {
      isDragging.value = true;
    };
    
    const onDragLeave = () => {
      isDragging.value = false;
    };
    
    const onDrop = (event) => {
      isDragging.value = false;
      const files = Array.from(event.dataTransfer.files).map(file => file.path);
      
      if (files.length > 0) {
        emit('files-selected', files);
      }
    };
    
    // Открываем диалог выбора файлов
    const openFileDialog = async () => {
      try {
        // Подготавливаем фильтры для каждого типа файлов
        const filters = [];
        
        if (props.supportedFormats.image.length > 0) {
          filters.push({
            name: 'Изображения',
            extensions: [...props.supportedFormats.image]
          });
        }
        
        if (props.supportedFormats.video.length > 0) {
          filters.push({
            name: 'Видео',
            extensions: [...props.supportedFormats.video]
          });
        }
        
        if (props.supportedFormats.audio.length > 0) {
          filters.push({
            name: 'Аудио',
            extensions: [...props.supportedFormats.audio]
          });
        }
        
        // Добавляем опцию для всех файлов
        filters.push({ name: 'Все файлы', extensions: ['*'] });
        
        const filePaths = await window.electronAPI.openFileDialog({ filters });
        
        if (filePaths && filePaths.length > 0) {
          emit('files-selected', filePaths);
        }
      } catch (error) {
        console.error('Ошибка при открытии диалога выбора файлов:', error);
        ElMessage.error('Не удалось открыть диалог выбора файлов');
      }
    };
    
    return {
      isDragging,
      allFormats,
      onDragOver,
      onDragLeave,
      onDrop,
      openFileDialog
    };
  }
};
</script>

<style scoped>
.drop-zone {
  border: 1px dashed #dcdfe6;
  border-radius: 12px;
  padding: 20px 20px;
  text-align: center;
  margin-bottom: 20px;
  transition: background-color 0.3s, border-color 0.3s;
  background-color: #dcdfe616;
  font-size: 14px;
  color: #b1b1b1;
}

.drop-zone.active {
  background-color: #f0f9ff;
  border-color: #409eff;
}

.drop-icon {
  font-size: 48px;
  color: #909399;
  margin-bottom: 10px;
}

.drop-text {
  margin-bottom: 10px;
  color: #aaadb2;
  font-weight: 400;
}

.supported-formats {
  color: #909399;
  margin-top: 10px;
}
</style>
