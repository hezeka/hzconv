<template>
  <aside class="insp">
    <div class="insp__top">
      <UiSegmented v-model="ui.tab" :options="tabs" class="insp__tabs" />
      <div class="insp__presets">
        <UiSelect :model-value="null" :options="presetOptions" placeholder="Пресеты" :menu-width="300" class="insp__preset" @update:model-value="onPreset" />
        <UiButton icon="save" title="Сохранить текущие настройки как пресет" @click="ui.presetDialog = true" />
      </div>
    </div>

    <div class="insp__body">
      <ImageSettings v-if="ui.tab === 'image'" />
      <VideoSettings v-else-if="ui.tab === 'video'" />
      <AudioSettings v-else-if="ui.tab === 'audio'" />
      <OutputSettings v-else />
    </div>

    <footer class="insp__foot">
      <button class="dest" type="button" title="Настроить сохранение" @click="ui.tab = 'output'">
        <Icon name="folder" :size="14" />
        <span class="ellipsis">{{ destination }}</span>
        <Icon name="chevron-right" :size="13" class="dest__chevron" />
      </button>

      <div v-if="queue.running" class="run">
        <div class="run__bar"><div class="run__fill" :style="{ transform: `scaleX(${progress})` }" /></div>
        <div class="run__row">
          <span class="num">{{ Math.round(progress * 100) }}%</span>
          <UiButton icon="stop" @click="cancelConversion">Остановить</UiButton>
        </div>
      </div>
      <UiButton v-else variant="primary" size="l" block :disabled="!queue.items.length" @click="startConversion()">
        {{ queue.items.length ? `Конвертировать ${files(queue.items.length)}` : 'Конвертировать' }}
        <template #trail><kbd class="insp__kbd">{{ mod }} ↵</kbd></template>
      </UiButton>
    </footer>

    <PresetDialog />
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { platform } from '../api';
import { ui } from '../store/ui';
import { settings, builtinPresets, userPresets, applyPreset } from '../store/settings';
import { queue, counts, progress, startConversion, cancelConversion } from '../store/queue';
import { toast } from '../store/toast';
import { files, shortPath } from '../utils/format';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';
import UiSegmented from './ui/UiSegmented.vue';
import UiSelect from './ui/UiSelect.vue';
import ImageSettings from './settings/ImageSettings.vue';
import VideoSettings from './settings/VideoSettings.vue';
import AudioSettings from './settings/AudioSettings.vue';
import OutputSettings from './settings/OutputSettings.vue';
import PresetDialog from './PresetDialog.vue';

const mod = platform === 'darwin' ? '⌘' : 'Ctrl';

const tabs = computed(() => [
  { value: 'image', label: 'Фото', count: counts.value.image || undefined, hint: 'Изображения' },
  { value: 'video', label: 'Видео', count: counts.value.video || undefined },
  { value: 'audio', label: 'Аудио', count: counts.value.audio || undefined },
  { value: 'output', label: 'Сохранение' }
]);

const GROUP = { image: 'Изображения', video: 'Видео', audio: 'Аудио' };

const presetOptions = computed(() => {
  const opts = [];
  const groups = ui.tab === 'output' ? Object.values(GROUP) : [GROUP[ui.tab]];
  for (const g of groups) {
    const list = builtinPresets.filter((p) => p.group === g);
    if (!list.length) continue;
    opts.push({ group: g });
    list.forEach((p) => opts.push({ value: p.id, label: p.name, hint: p.hint }));
  }
  if (userPresets.value.length) {
    opts.push({ group: 'Мои пресеты' });
    userPresets.value.forEach((p) => opts.push({ value: p.id, label: p.name, hint: Object.keys(p.patch).map(sectionName).join(', ') }));
  }
  return opts;
});

function sectionName(s) {
  return { image: 'изображения', video: 'видео', audio: 'аудио', output: 'сохранение' }[s] || s;
}

function onPreset(id) {
  const preset = builtinPresets.find((p) => p.id === id) || userPresets.value.find((p) => p.id === id);
  if (!preset) return;
  applyPreset(preset);
  const first = Object.keys(preset.patch)[0];
  if (first && first !== ui.tab && ui.tab !== 'output') ui.tab = first;
  toast(`Пресет «${preset.name}» применён`, { kind: 'ok' });
}

const destination = computed(() => {
  const o = settings.output;
  if (o.location === 'source') return 'Рядом с исходными файлами';
  if (o.location === 'subdir') return `В подпапку «${o.subDir || 'converted'}»`;
  return o.customDir ? shortPath(o.customDir, 38) : 'Папка не выбрана';
});
</script>

<style scoped>
.insp {
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-radius: var(--r-l);
  box-shadow: 0 0 0 1px var(--line);
  overflow: hidden;
}

.insp__top {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--line);
}

.insp__tabs :deep(.seg__item) {
  gap: 5px;
}

.insp__presets {
  display: flex;
  gap: 6px;
}

.insp__preset {
  flex: 1;
}

.insp__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.insp__foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.dest {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 6px;
  margin: 0 -6px;
  border: 0;
  border-radius: var(--r-s);
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  text-align: left;
}

.dest:hover {
  background: var(--panel-2);
  color: var(--text);
}

.dest span {
  flex: 1;
}

.dest__chevron {
  color: var(--text-3);
}

.insp__kbd {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.85);
  font-size: 10px;
}

.run {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.run__bar {
  height: 4px;
  border-radius: 3px;
  background: var(--panel-3);
  overflow: hidden;
}

.run__fill {
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 240ms linear;
}

.run__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-2);
}
</style>
