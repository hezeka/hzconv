<template>
  <aside class="insp">
    <div class="insp__head">
      <div v-if="ui.compact || ui.mode === 'batch'" class="insp__ctx" :class="{ 'is-batch': ui.mode === 'batch' }">
        <Icon v-if="ui.mode === 'batch'" name="layers" :size="14" />
        <span class="ellipsis">{{ contextLabel }}</span>
        <UiButton v-if="ui.compact" variant="ghost" size="s" icon="close" title="Закрыть настройки" class="insp__close" @click="ui.settingsOpen = false" />
      </div>
      <UiSegmented v-model="ui.tab" :options="tabs" class="insp__tabs" />
      <div class="insp__presets">
        <UiSelect :model-value="null" :options="presetOptions" placeholder="Пресеты" :menu-width="300" class="insp__preset" @update:model-value="onPreset" />
        <UiButton icon="save" title="Сохранить текущие настройки как пресет" @click="ui.presetDialog = true" />
      </div>
    </div>

    <div ref="body" class="insp__body">
      <ImageSettings v-if="ui.tab === 'image'" />
      <VideoSettings v-else-if="ui.tab === 'video'" />
      <AudioSettings v-else />
    </div>

    <footer class="insp__foot">
      <button class="dest" type="button" title="Показать настройки сохранения" @click="showSave">
        <Icon name="folder" :size="14" class="dest__icon" />
        <span class="dest__text ellipsis">{{ destination }}</span>
        <span class="dest__link">Изменить</span>
      </button>

      <ActionButton />
    </footer>

    <PresetDialog />
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { ui } from '../store/ui';
import { settings, builtinPresets, userPresets, applyPreset } from '../store/settings';
import { queue, counts, selectedItem } from '../store/queue';
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
import PresetDialog from './PresetDialog.vue';
import ActionButton from './ActionButton.vue';


const typeCounts = computed(() => (ui.mode === 'batch' ? batch.stats?.byType || {} : counts.value));
const nf = new Intl.NumberFormat('ru-RU', { notation: 'compact' });
const tabCount = (n) => (n ? nf.format(n) : undefined);

const tabs = computed(() => [
  { value: 'image', label: 'Фото', count: tabCount(typeCounts.value.image), hint: 'Изображения' },
  { value: 'video', label: 'Видео', count: tabCount(typeCounts.value.video) },
  { value: 'audio', label: 'Аудио', count: tabCount(typeCounts.value.audio) }
]);

// Вкладка следует за файлами: выбранный файл открывает свои настройки,
// а пустая вкладка уступает место той, где файлы есть.
const TYPES = ['image', 'video', 'audio'];
watch(
  () => selectedItem.value?.type,
  (type) => {
    if (type && ui.mode === 'files') ui.tab = type;
  }
);
watch(
  typeCounts,
  (c) => {
    if (c[ui.tab]) return;
    const best = TYPES.filter((t) => c[t]).sort((a, b) => c[b] - c[a])[0];
    if (best) ui.tab = best;
  },
  { immediate: true }
);

const GROUP = { image: 'Изображения', video: 'Видео', audio: 'Аудио' };

const presetOptions = computed(() => {
  const opts = [];
  const list = builtinPresets.filter((p) => p.group === GROUP[ui.tab]);
  if (list.length) {
    opts.push({ group: GROUP[ui.tab] });
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
  const first = Object.keys(preset.patch).find((k) => TYPES.includes(k));
  if (first && first !== ui.tab) ui.tab = first;
  toast(`Пресет «${preset.name}» применён`, { kind: 'ok' });
}

// Строка внизу ведёт к острову «Сохранение» и подсвечивает его.
const body = ref(null);
function showSave() {
  const island = body.value?.querySelector('[data-island="save"]');
  if (!island) return;
  island.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  island.classList.remove('is-flash');
  void island.offsetWidth;
  island.classList.add('is-flash');
}

const contextLabel = computed(() => {
  if (ui.mode === 'batch') return activeJob.value ? `Задание «${activeJob.value.name}»` : 'Пакетный режим';
  return 'Настройки';
});

const destination = computed(() => {
  const o = settings.output;
  if (o.location === 'source') return 'Рядом с исходными файлами';
  if (o.location === 'subdir') return `В подпапку «${o.subDir || 'converted'}»`;
  return o.customDir ? shortPath(o.customDir, 32) : 'Папка не выбрана';
});
</script>

<style scoped>
/* Правая колонка — стопка островов: шапка, настройки, запуск */
.insp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.insp__head,
.insp__foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--panel);
  border-radius: var(--r-l);
  box-shadow: 0 0 0 1px var(--line);
}

.insp__ctx {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 4px 0 8px;
  border-radius: var(--r-s);
  font-size: 12.5px;
  font-weight: 560;
  color: var(--text);
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

/* Полоса прокрутки уходит в отступ справа — острова стоят ровно под шапкой */
.insp__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-right: -8px;
  padding: 1px 8px 1px 1px;
  margin-left: -1px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.insp__body::-webkit-scrollbar {
  width: 8px;
}

.insp__body::-webkit-scrollbar-thumb {
  border-width: 2px;
}

.insp__body :deep(.island.is-flash) {
  animation: flash 1s var(--ease);
}

@keyframes flash {
  0%,
  40% {
    box-shadow: 0 0 0 1px var(--accent-line), 0 0 0 4px var(--accent-soft);
  }
  100% {
    box-shadow: 0 0 0 1px var(--line);
  }
}

.dest {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r-s);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  text-align: left;
}

.dest:hover {
  background: var(--panel-2);
  color: var(--text);
}

.dest__icon {
  flex: none;
  color: var(--text-3);
}

.dest__text {
  flex: 1;
}

.dest__link {
  flex: none;
  font-size: 12px;
  font-weight: 540;
  color: var(--accent);
}
</style>
