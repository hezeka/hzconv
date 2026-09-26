<template>
  <UiSection title="Сохранение" data-island="save">
    <UiSegmented v-model="o.location" :options="locations" />

    <p v-if="o.location === 'source'" class="note">Файлы появятся рядом с исходными.</p>

    <UiField v-else-if="o.location === 'subdir'" label="Имя подпапки" hint="Рядом с исходными">
      <UiInput v-model="o.subDir" mono placeholder="converted" />
    </UiField>

    <template v-else>
      <div class="dir">
        <UiInput v-model="o.customDir" mono placeholder="Путь, например D:\Фото или ../export" />
        <UiButton icon="folder-open" title="Выбрать папку" @click="pickDir">Обзор</UiButton>
      </div>
      <p class="note">{{ ui.mode === 'batch' ? 'Относительный путь считается от папки задания: ../cards — соседняя папка cards.' : 'Относительный путь считается от папки исходного файла.' }}</p>
    </template>

    <UiSwitch v-if="o.location !== 'source'" v-model="o.preserveStructure" :hint="ui.mode === 'batch' ? 'Подпапки задания повторятся в папке результата' : 'Для папок, добавленных целиком'">
      Сохранять структуру папок
    </UiSwitch>

    <UiField label="Если файл уже есть" stack>
      <UiSelect v-model="o.conflict" :options="conflicts" />
    </UiField>
    <p v-if="o.conflict === 'overwrite' && o.location === 'source'" class="note note--warn">
      Если формат не меняется, исходники будут заменены результатом. Отменить нельзя.
    </p>
    <p v-else class="note">{{ conflictNote }}</p>
  </UiSection>

  <UiSection title="Имя файла и прочее" collapsible store-key="output-more" :open="false" :summary="moreSummary">
    <UiField label="Имя файла" stack>
      <UiInput v-model="o.template" mono placeholder="{name}" />
    </UiField>
    <div class="chips">
      <button v-for="t in tokens" :key="t.token" type="button" class="chip mono" :title="t.hint" @click="insert(t.token)">{{ t.token }}</button>
    </div>
    <p class="note">
      Пример: <span class="mono example">{{ example }}</span>
    </p>
    <UiSwitch v-model="o.keepDates" hint="Сортировка фотоархива по дате не собьётся">Сохранять дату изменения</UiSwitch>
    <UiSwitch v-model="o.openWhenDone">Открыть папку с результатом</UiSwitch>
    <UiField label="Фото" hint="Одновременно">
      <UiSelect v-model="p.imageJobs" :options="imageJobOptions" />
    </UiField>
    <UiField label="Видео и аудио" hint="Одновременно">
      <UiSelect v-model="p.mediaJobs" :options="mediaJobOptions" />
    </UiField>
    <div class="reset">
      <UiButton variant="ghost" size="s" icon="reset" @click="resetSection('output'), resetSection('performance')">Сбросить настройки сохранения</UiButton>
    </div>
  </UiSection>
</template>

<script setup>
import { computed } from 'vue';
import { api } from '../../api';
import { settings, resetSection } from '../../store/settings';
import { ui } from '../../store/ui';
import UiSection from '../ui/UiSection.vue';
import UiField from '../ui/UiField.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiSegmented from '../ui/UiSegmented.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiInput from '../ui/UiInput.vue';
import UiButton from '../ui/UiButton.vue';

const o = settings.output;
const p = settings.performance;

const locations = [
  { value: 'source', label: 'Рядом' },
  { value: 'subdir', label: 'В подпапку' },
  { value: 'custom', label: 'В папку' }
];

const conflicts = [
  { value: 'newer', label: 'Обновить, если исходник изменился', hint: 'Для регулярных заданий: актуальные файлы пропускаются' },
  { value: 'rename', label: 'Сохранить рядом с номером', hint: 'photo_1.webp' },
  { value: 'overwrite', label: 'Заменить' },
  { value: 'skip', label: 'Пропустить' }
];

const conflictNote = computed(
  () =>
    ({
      newer: 'Повторный запуск обработает только новые и изменённые файлы.',
      rename: 'Новый файл получит номер: photo_1.webp',
      overwrite: 'Существующий файл будет заменён.',
      skip: 'Файл не конвертируется, если результат уже есть.'
    })[o.conflict]
);

const tokens = [
  { token: '{name}', hint: 'Имя исходного файла' },
  { token: '{w}', hint: 'Ширина результата' },
  { token: '{h}', hint: 'Высота результата' },
  { token: '{date}', hint: 'Сегодняшняя дата, ГГГГ-ММ-ДД' },
  { token: '{n}', hint: 'Номер файла в очереди' },
  { token: '{fmt}', hint: 'Расширение результата' }
];

function insert(token) {
  o.template = `${o.template || ''}${token}`;
}

const example = computed(() => {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmt = settings.image.format === 'original' ? 'jpg' : settings.image.format;
  let name = (o.template || '{name}').replace(/\{name\}/g, 'photo').replace(/\{w\}/g, '1920').replace(/\{h\}/g, '1080').replace(/\{date\}/g, date).replace(/\{n\}/g, '1').replace(/\{fmt\}/g, fmt);
  name = name.replace(/[<>:"/\\|?*]/g, '_') || 'photo';
  return `${name}.${fmt}`;
});

const moreSummary = computed(() => {
  const parts = [];
  if (o.template && o.template !== '{name}') parts.push(o.template);
  if (o.keepDates) parts.push('даты');
  if (o.openWhenDone) parts.push('открыть папку');
  return parts.join(' · ');
});

async function pickDir() {
  const dir = await api.openFolder({ title: 'Папка для сохранения', defaultPath: o.customDir || undefined });
  if (dir) o.customDir = dir;
}

const imageJobOptions = [{ value: 0, label: 'Авто' }, ...[1, 2, 3, 4, 6, 8].map((n) => ({ value: n, label: String(n) }))];
const mediaJobOptions = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));
</script>

<style scoped>
.dir {
  display: flex;
  gap: 6px;
}

.dir > :first-child {
  flex: 1;
  min-width: 0;
}

.example {
  color: var(--text-2);
}
</style>
