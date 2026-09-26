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
  </UiModal>
</template>

<script setup>
import { platform } from '../api';
import { ui } from '../store/ui';
import UiModal from './ui/UiModal.vue';

const mod = platform === 'darwin' ? '⌘' : 'Ctrl';

const keys = [
  { label: 'Добавить файлы', combo: [mod, 'O'] },
  { label: 'Добавить папку', combo: [mod, 'Shift', 'O'] },
  { label: 'Вставить картинку из буфера', combo: [mod, 'V'] },
  { label: 'Конвертировать', combo: [mod, 'Enter'] },
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
