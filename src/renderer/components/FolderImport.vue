<template>
  <UiModal :open="Boolean(ui.folderImport)" title="Добавить папку" :subtitle="ui.folderImport || ''" size="m" @close="close">
    <div class="fi">
      <div class="fi__row">
        <UiSwitch v-model="ui.folderRecursive" class="fi__switch">Включая вложенные папки</UiSwitch>
        <UiButton size="s" icon="folder-open" @click="changeDir">Другая папка</UiButton>
      </div>

      <UiField label="Типы файлов">
        <UiSegmented v-model="typeFilter" :options="typeOptions" small />
      </UiField>
      <UiField label="Расширения" hint="Через запятую">
        <UiInput v-model="extFilter" mono clearable placeholder="все поддерживаемые, например: jpg, png" />
      </UiField>

      <FolderTree v-if="ui.folderRecursive" v-model="excluded" :folders="folders" :loading="loadingFolders" max-height="240px" class="fi__folders" />
    </div>

    <template #footer>
      <span class="fi__found">
        <template v-if="scanning">Подсчёт…</template>
        <template v-else-if="found !== null">Найдено: <b class="num">{{ found.length }}</b> {{ plural(found.length, 'файл', 'файла', 'файлов') }}</template>
      </span>
      <UiButton @click="close">Отмена</UiButton>
      <UiButton variant="primary" :disabled="!found || !found.length || adding" @click="add">
        {{ found && found.length ? `Добавить ${found.length}` : 'Добавить' }}
      </UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { api, errorText } from '../api';
import { ui } from '../store/ui';
import { settings } from '../store/settings';
import { addEntries } from '../store/queue';
import { toast } from '../store/toast';
import { plural } from '../utils/format';
import { inputFormats } from '../utils/targets';
import FolderTree from './FolderTree.vue';
import UiModal from './ui/UiModal.vue';
import UiField from './ui/UiField.vue';
import UiSwitch from './ui/UiSwitch.vue';
import UiSegmented from './ui/UiSegmented.vue';
import UiInput from './ui/UiInput.vue';
import UiButton from './ui/UiButton.vue';

const typeFilter = ref('all');
const extFilter = ref('');
const folders = ref([]);
const excluded = ref([]);
const loadingFolders = ref(false);
const found = ref(null);
const scanning = ref(false);
const adding = ref(false);

const typeOptions = [
  { value: 'all', label: 'Все' },
  { value: 'image', label: 'Изображения' },
  { value: 'video', label: 'Видео' },
  { value: 'audio', label: 'Аудио' }
];

const excludes = () => (settings.output.location === 'subdir' && settings.output.subDir ? [settings.output.subDir] : []);

const formatsFilter = computed(() => {
  const typed = extFilter.value
    .split(/[,;\s]+/)
    .map((f) => f.trim().toLowerCase().replace(/^\*?\./, ''))
    .filter(Boolean);
  if (typed.length) return typed;
  return typeFilter.value === 'all' ? [] : inputFormats(typeFilter.value);
});

async function loadFolders() {
  const dir = ui.folderImport;
  folders.value = [];
  excluded.value = [];
  if (!dir || !ui.folderRecursive) return;
  loadingFolders.value = true;
  try {
    const list = await api.getSubfolders({ dir, exclude: excludes() });
    if (ui.folderImport !== dir) return;
    folders.value = list;
  } catch (e) {
    toast(`Не удалось прочитать папку: ${errorText(e)}`, { kind: 'error' });
  } finally {
    loadingFolders.value = false;
  }
}

let scanTimer = null;
let scanSeq = 0;
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 220);
}

async function scan() {
  const dir = ui.folderImport;
  if (!dir) return;
  const my = ++scanSeq;
  scanning.value = true;
  try {
    const list = await api.scanFolder({
      dir,
      recursive: ui.folderRecursive,
      formats: formatsFilter.value,
      excluded: ui.folderRecursive ? excluded.value : [],
      exclude: excludes()
    });
    if (my === scanSeq) found.value = list;
  } catch (e) {
    if (my === scanSeq) found.value = [];
    toast(errorText(e), { kind: 'error' });
  } finally {
    if (my === scanSeq) scanning.value = false;
  }
}

watch(
  () => ui.folderImport,
  async (dir) => {
    if (!dir) return;
    found.value = null;
    await loadFolders();
    scan();
  }
);

watch(
  () => ui.folderRecursive,
  async () => {
    if (!ui.folderImport) return;
    await loadFolders();
    scheduleScan();
  }
);

watch([formatsFilter, excluded], scheduleScan, { deep: true });

async function changeDir() {
  const dir = await api.openFolder({ title: 'Добавить папку', defaultPath: ui.folderImport || undefined });
  if (dir) ui.folderImport = dir;
}

async function add() {
  if (!found.value?.length) return;
  adding.value = true;
  try {
    await addEntries(found.value);
    close();
  } finally {
    adding.value = false;
  }
}

function close() {
  ui.folderImport = null;
  clearTimeout(scanTimer);
}
</script>

<style scoped>
.fi {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fi__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fi__switch {
  flex: 1;
}

.fi__folders {
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.fi__found {
  margin-right: auto;
  font-size: 12.5px;
  color: var(--text-2);
}

.fi__found b {
  color: var(--text);
  font-weight: 600;
}

</style>
