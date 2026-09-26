<template>
  <div>
    <UiSection title="Куда сохранять">
      <UiSegmented v-model="o.location" :options="locations" />

      <UiField v-if="o.location === 'subdir'" label="Имя подпапки">
        <UiInput v-model="o.subDir" mono placeholder="converted" />
      </UiField>

      <template v-if="o.location === 'custom'">
        <div class="dir">
          <UiInput v-model="o.customDir" mono placeholder="Путь или относительный путь, например ../export" />
          <UiButton icon="folder-open" title="Выбрать папку" @click="pickDir" />
        </div>
        <p class="note">{{ ui.mode === 'batch' ? 'Относительный путь отсчитывается от папки задания: ../cards — соседняя папка cards.' : 'Относительный путь отсчитывается от папки исходного файла или добавленной папки.' }}</p>
      </template>

      <UiSwitch v-if="o.location !== 'source'" v-model="o.preserveStructure" :hint="ui.mode === 'batch' ? 'Подпапки задания повторятся в папке результата' : 'Для файлов, добавленных папкой: вложенные папки повторятся в результате'">
        Сохранять структуру папок
      </UiSwitch>
    </UiSection>

    <UiSection title="Имя файла">
      <UiInput v-model="o.template" mono placeholder="{name}" />
      <div class="chips">
        <button v-for="t in tokens" :key="t.token" type="button" class="chip mono" :title="t.hint" @click="insert(t.token)">{{ t.token }}</button>
      </div>
      <p class="note">
        Пример: <span class="mono example">{{ example }}</span>
      </p>
    </UiSection>

    <UiSection title="Если файл уже есть">
      <UiSelect v-model="o.conflict" :options="conflicts" />
      <p v-if="o.conflict === 'overwrite' && o.location === 'source'" class="note note--warn">
        Если формат не меняется, исходники будут заменены результатом. Удобно для пакетного сжатия, но отменить нельзя.
      </p>
      <p v-else class="note">{{ conflictNote }}</p>
    </UiSection>

    <UiSection title="После конвертации">
      <UiSwitch v-model="o.keepDates" hint="Удобно для фотоархива: сортировка по дате не собьётся">Сохранять дату изменения</UiSwitch>
      <UiSwitch v-model="o.openWhenDone">Открыть папку с результатом</UiSwitch>
    </UiSection>

    <UiSection title="Производительность" collapsible store-key="perf" :open="false" :summary="perfSummary">
      <UiField label="Изображения" hint="Одновременно">
        <UiSelect v-model="p.imageJobs" :options="imageJobOptions" />
      </UiField>
      <UiField label="Видео и аудио" hint="Одновременно">
        <UiSelect v-model="p.mediaJobs" :options="mediaJobOptions" />
      </UiField>
      <p class="note">Видео кодируется во все ядра, поэтому по умолчанию — по одному файлу.</p>
    </UiSection>

    <div class="reset reset--pad">
      <UiButton variant="ghost" size="s" icon="reset" @click="resetSection('output'), resetSection('performance')">Сбросить настройки сохранения</UiButton>
    </div>
  </div>
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
  { value: 'subdir', label: 'Подпапка' },
  { value: 'custom', label: 'Папка' }
];

const conflicts = [
  { value: 'newer', label: 'Обновить, если исходник изменился', hint: 'Для регулярных заданий: актуальные файлы пропускаются' },
  { value: 'rename', label: 'Сохранить рядом с номером', hint: 'photo_1.webp' },
  { value: 'overwrite', label: 'Всегда заменять' },
  { value: 'skip', label: 'Пропускать' }
];

const conflictNote = computed(
  () =>
    ({
      newer: 'Повторный запуск обработает только новые и изменённые файлы — остальные пропускаются за секунды.',
      rename: 'Новый файл получит суффикс: photo_1.webp',
      overwrite: 'Существующий файл будет заменён',
      skip: 'Файл не конвертируется, если результат уже есть'
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

async function pickDir() {
  const dir = await api.openFolder({ title: 'Папка для сохранения', defaultPath: o.customDir || undefined });
  if (dir) o.customDir = dir;
}

const imageJobOptions = [{ value: 0, label: 'Авто' }, ...[1, 2, 3, 4, 6, 8].map((n) => ({ value: n, label: String(n) }))];
const mediaJobOptions = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));
const perfSummary = computed(() => `фото: ${p.imageJobs || 'авто'} · видео: ${p.mediaJobs}`);
</script>

<style scoped>
.dir {
  display: flex;
  gap: 6px;
}

.dir > :first-child {
  flex: 1;
}

.example {
  color: var(--text-2);
}

.reset--pad {
  padding: 8px 16px 16px;
  margin: 0;
  border-top: 1px solid var(--line);
}
</style>
