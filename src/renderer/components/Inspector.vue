<template>
  <aside class="insp">
    <div class="insp__top">
      <div class="insp__ctx" :class="{ 'is-batch': ui.mode === 'batch' }">
        <Icon :name="ui.mode === 'batch' ? 'layers' : 'files'" :size="14" />
        <span class="ellipsis">{{ contextLabel }}</span>
        <UiButton v-if="ui.compact" variant="ghost" size="s" icon="close" title="Закрыть настройки" class="insp__close" @click="ui.settingsOpen = false" />
      </div>
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

      <ActionButton />
    </footer>

    <PresetDialog />
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { ui } from '../store/ui';
import { settings, builtinPresets, userPresets, applyPreset } from '../store/settings';
import { queue, counts } from '../store/queue';
import { batch, activeJob } from '../store/batch';
import { toast } from '../store/toast';
import { shortPath } from '../utils/format';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';
import UiSegmented from './ui/UiSegmented.vue';
import UiSelect from './ui/UiSelect.vue';
import ImageSettings from './settings/ImageSettings.vue';
import VideoSettings from './settings/VideoSettings.vue';
import AudioSettings from './settings/AudioSettings.vue';
import OutputSettings from './settings/OutputSettings.vue';
import PresetDialog from './PresetDialog.vue';
import ActionButton from './ActionButton.vue';


const typeCounts = computed(() => (ui.mode === 'batch' ? batch.stats?.byType || {} : counts.value));
const nf = new Intl.NumberFormat('ru-RU', { notation: 'compact' });
const tabCount = (n) => (n ? nf.format(n) : undefined);

const tabs = computed(() => [
  { value: 'image', label: 'Фото', count: tabCount(typeCounts.value.image), hint: 'Изображения' },
  { value: 'video', label: 'Видео', count: tabCount(typeCounts.value.video) },
  { value: 'audio', label: 'Аудио', count: tabCount(typeCounts.value.audio) },
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

const contextLabel = computed(() => {
  if (ui.mode === 'batch') return activeJob.value ? `Задание «${activeJob.value.name}»` : 'Пакетный режим';
  return queue.items.length ? `Файлы в очереди · ${queue.items.length}` : 'Файлы в очереди';
});

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

.insp__ctx {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 4px 0 8px;
  border-radius: var(--r-s);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}

.insp__ctx.is-batch {
  background: var(--accent-soft);
  color: var(--accent);
}

.insp__ctx span {
  flex: 1;
}

.insp__close {
  margin-left: auto;
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

</style>
