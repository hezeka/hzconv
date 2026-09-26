<template>
  <div class="cbar">
    <UiSelect v-model="settings[type].format" :options="formatOptions" class="cbar__format" :menu-width="180" />
    <UiButton icon="sliders" :title="'Все настройки'" @click="ui.settingsOpen = true">{{ ui.narrow ? '' : 'Настройки' }}</UiButton>
    <div class="cbar__action"><ActionButton /></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { ui } from '../store/ui';
import { settings } from '../store/settings';
import { counts } from '../store/queue';
import { batch } from '../store/batch';
import { outputFormats } from '../utils/targets';
import UiSelect from './ui/UiSelect.vue';
import UiButton from './ui/UiButton.vue';
import ActionButton from './ActionButton.vue';

// Быстрый выбор формата для типа, которого в работе больше всего.
const type = computed(() => {
  const c = ui.mode === 'batch' ? batch.stats?.byType || {} : counts.value;
  const order = ['image', 'video', 'audio'].sort((a, b) => (c[b] || 0) - (c[a] || 0));
  return (c[order[0]] || 0) > 0 ? order[0] : 'image';
});

const PREFIX = { image: 'Фото', video: 'Видео', audio: 'Аудио' };
const formatOptions = computed(() => [
  { group: `${PREFIX[type.value]} → формат` },
  ...outputFormats(type.value).map((f) => ({ value: f.id, label: f.label }))
]);
</script>

<style scoped>
.cbar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px;
  border-radius: var(--r-l);
  background: var(--panel);
  box-shadow: 0 0 0 1px var(--line);
}

.cbar__format {
  width: 120px;
  flex: none;
}

.cbar__format :deep(.select__trigger),
.cbar > :deep(.btn) {
  height: 38px;
}

.cbar__action {
  flex: 1;
  min-width: 0;
}
</style>
