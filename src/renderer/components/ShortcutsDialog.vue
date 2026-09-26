<template>
  <UiModal :open="ui.shortcuts" title="Горячие клавиши" size="s" @close="ui.shortcuts = false">
    <dl class="keys">
      <template v-for="k in keys" :key="k.label">
        <dt>{{ k.label }}</dt>
        <dd>
          <kbd v-for="part in k.combo" :key="part">{{ part }}</kbd>
        </dd>
      </template>
    </dl>
    <template #footer>
      <span class="about">Hzconv {{ version }}</span>
      <UiButton variant="ghost" size="s" icon="logs" @click="api.openLogs()">Журнал ошибок</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, watch } from 'vue';
import { api, platform } from '../api';
import { ui } from '../store/ui';
import UiModal from './ui/UiModal.vue';
import UiButton from './ui/UiButton.vue';

const version = ref('');
watch(
  () => ui.shortcuts,
  async (open) => {
    if (open && !version.value) version.value = (await api.info()).version;
  }
);

const mod = platform === 'darwin' ? '⌘' : 'Ctrl';

const keys = [
  { label: 'Добавить файлы (режим «Файлы»)', combo: [mod, 'O'] },
  { label: 'Добавить папку', combo: [mod, 'Shift', 'O'] },
  { label: 'Вставить картинку из буфера', combo: [mod, 'V'] },
  { label: 'Конвертировать / запустить задание', combo: [mod, 'Enter'] },
  { label: 'Остановить', combo: ['Esc'] },
  { label: 'Выбрать файл', combo: ['↑', '↓'] },
  { label: 'Предпросмотр результата', combo: ['Пробел'] },
  { label: 'Кадр и поворот', combo: ['C'] },
  { label: 'Убрать из очереди', combo: ['Delete'] },
  { label: 'В редакторе: сдвиг рамки', combo: ['←', '→', 'Shift'] },
  { label: 'В редакторе: применить', combo: ['Enter'] }
];
</script>

<style scoped>
.keys {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px 16px;
  margin: 0;
  font-size: 12.5px;
}

.about {
  margin-right: auto;
  font-size: 12px;
  color: var(--text-3);
}

dt {
  color: var(--text-2);
}

dd {
  margin: 0;
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
</style>
