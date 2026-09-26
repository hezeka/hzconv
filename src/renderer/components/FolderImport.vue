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

      <div v-if="ui.folderRecursive" class="fi__folders">
        <div class="fi__folders-head">
          <label class="check">
            <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected" @change="toggleAll($event.target.checked)" />
            <span>Все папки</span>
          </label>
          <span class="faint">{{ selected.length ? `выбрано ${selected.length}` : 'выбор не задан — берутся все' }}</span>
        </div>

        <UiInput v-model="search" icon="search" clearable placeholder="Поиск по названию, * — любые символы" class="fi__search" />

        <div class="fi__list">
          <div v-if="loadingFolders" class="fi__empty">Читаю структуру папок…</div>
          <div v-else-if="!filteredFolders.length" class="fi__empty">{{ folders.length ? 'Ничего не найдено' : 'Вложенных папок нет' }}</div>
          <label
            v-for="f in filteredFolders"
            v-else
            :key="f.path"
            class="check fi__item"
            :style="{ paddingLeft: `${10 + (search ? 0 : f.depth * 16)}px` }"
          >
            <input type="checkbox" :checked="selected.includes(f.path)" @change="toggle(f.path)" />
            <Icon :name="f.isRoot ? 'layers' : 'folder'" :size="14" class="fi__icon" />
            <span class="ellipsis">{{ search && !f.isRoot ? f.relativePath : f.name }}</span>
            <span class="fi__count num">{{ f.fileCount || '' }}</span>
          </label>
        </div>
      </div>
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
import Icon from './ui/Icon.vue';
import UiModal from './ui/UiModal.vue';
import UiField from './ui/UiField.vue';
import UiSwitch from './ui/UiSwitch.vue';
import UiSegmented from './ui/UiSegmented.vue';
import UiInput from './ui/UiInput.vue';
import UiButton from './ui/UiButton.vue';

const typeFilter = ref('all');
const extFilter = ref('');
const search = ref('');
const folders = ref([]);
const selected = ref([]);
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

// Поиск: подстрока без учёта регистра, * — любые символы.
function matches(text, pattern) {
  if (!pattern.includes('*')) return text.toLowerCase().includes(pattern.toLowerCase());
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i').test(text);
}

const filteredFolders = computed(() => {
  const q = search.value.trim();
  if (!q) return folders.value;
  return folders.value.filter((f) => f.isRoot || matches(f.name, q) || matches(f.relativePath, q));
});

const allSelected = computed(() => folders.value.length > 0 && selected.value.length === folders.value.length);
const someSelected = computed(() => selected.value.length > 0 && !allSelected.value);

function toggle(p) {
  selected.value = selected.value.includes(p) ? selected.value.filter((x) => x !== p) : [...selected.value, p];
}

function toggleAll(on) {
  const visible = filteredFolders.value.map((f) => f.path);
  selected.value = on ? [...new Set([...selected.value, ...visible])] : selected.value.filter((p) => !visible.includes(p));
}

async function loadFolders() {
  const dir = ui.folderImport;
  folders.value = [];
  selected.value = [];
  if (!dir || !ui.folderRecursive) return;
  loadingFolders.value = true;
  try {
    const list = await api.getSubfolders({ dir, exclude: excludes() });
    if (ui.folderImport !== dir) return;
    folders.value = [{ path: dir, name: 'Файлы в корне папки', relativePath: '', depth: 0, fileCount: 0, isRoot: true }, ...list];
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
      subfolders: ui.folderRecursive ? selected.value : [],
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
    search.value = '';
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

watch([formatsFilter, selected], scheduleScan, { deep: true });

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
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.fi__folders-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
}

.faint {
  color: var(--text-3);
  font-size: 11.5px;
}

.fi__list {
  height: 240px;
  overflow-y: auto;
  border-radius: var(--r);
  background: var(--panel-2);
  box-shadow: inset 0 0 0 1px var(--line);
  padding: 4px 0;
}

.fi__empty {
  padding: 30px;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
}

.fi__item {
  height: 30px;
  padding-right: 12px;
}

.fi__item:hover {
  background: var(--panel-3);
}

.fi__icon {
  color: var(--text-3);
}

.fi__count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
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

.check {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  color: var(--text);
}

.check input {
  appearance: none;
  -webkit-appearance: none;
  flex: none;
  width: 15px;
  height: 15px;
  margin: 0;
  border-radius: 4px;
  background: var(--panel);
  box-shadow: inset 0 0 0 1px var(--line-3);
  display: grid;
  place-items: center;
  transition: background var(--t-fast) var(--ease);
}

.check input:checked,
.check input:indeterminate {
  background: var(--accent);
  box-shadow: none;
}

.check input:checked::after {
  content: '';
  width: 8px;
  height: 4px;
  border-left: 1.75px solid #fff;
  border-bottom: 1.75px solid #fff;
  transform: translateY(-1px) rotate(-45deg);
}

.check input:indeterminate::after {
  content: '';
  width: 7px;
  height: 1.75px;
  background: #fff;
  border-radius: 1px;
}
</style>
