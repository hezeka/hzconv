<template>
  <div class="ft">
    <div class="ft__head">
      <label class="check">
        <input type="checkbox" :checked="allOn" :indeterminate.prop="someOn" @change="setVisible($event.target.checked)" />
        <span>{{ search ? 'Найденные папки' : 'Все папки' }}</span>
      </label>
      <span class="ft__summary">{{ summary }}</span>
    </div>

    <UiInput v-if="folders.length > 6" v-model="search" icon="search" clearable placeholder="Поиск по названию, * — любые символы" />

    <div class="ft__list" :style="{ maxHeight }">
      <div v-if="loading" class="ft__empty">Читаю структуру папок…</div>
      <div v-else-if="!rows.length" class="ft__empty">{{ folders.length ? 'Ничего не найдено' : 'Вложенных папок нет — берутся файлы из корня' }}</div>
      <label
        v-for="f in rows"
        v-else
        :key="f.rel"
        class="check ft__item"
        :class="{ 'is-off': !isOn(f.rel) }"
        :style="{ paddingLeft: `${10 + (search ? 0 : f.depth * 16)}px` }"
        :title="f.rel || rootLabel"
      >
        <input type="checkbox" :checked="isOn(f.rel)" :indeterminate.prop="isMixed(f)" @change="toggle(f)" />
        <Icon :name="f.isRoot ? 'layers' : 'folder'" :size="14" class="ft__icon" />
        <span class="ellipsis">{{ search && !f.isRoot ? f.rel : f.name }}</span>
        <span class="ft__count num">{{ f.fileCount || '' }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Icon from './ui/Icon.vue';
import UiInput from './ui/UiInput.vue';

const props = defineProps({
  // Список из getSubfolders: { name, relativePath, depth, fileCount }
  folders: { type: Array, default: () => [] },
  // Отключённые папки (относительные пути, '' — файлы в корне)
  modelValue: { type: Array, default: () => [] },
  loading: Boolean,
  maxHeight: { type: String, default: 'none' }
});
const emit = defineEmits(['update:modelValue']);

const rootLabel = 'Файлы в корне папки';
const search = ref('');
const norm = (r) => String(r || '').split(/[\\/]+/).filter(Boolean).join('/');

const all = computed(() => [
  { rel: '', name: rootLabel, depth: 0, fileCount: null, isRoot: true },
  ...props.folders.map((f) => ({ rel: norm(f.relativePath), name: f.name, depth: f.depth + 1, fileCount: f.fileCount }))
]);

const off = computed(() => new Set(props.modelValue.map(norm)));
const isOn = (rel) => !off.value.has(rel);
const descendants = (rel) => (rel ? all.value.filter((f) => f.rel.startsWith(`${rel}/`)) : []);

// Поиск: подстрока без учёта регистра, * — любые символы.
function matches(text, pattern) {
  if (!pattern.includes('*')) return text.toLowerCase().includes(pattern.toLowerCase());
  const re = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(re, 'i').test(text);
}

const rows = computed(() => {
  const q = search.value.trim();
  if (!q) return all.value;
  return all.value.filter((f) => !f.isRoot && (matches(f.name, q) || matches(f.rel, q)));
});

// Папки, у которых вложенные включены не так, как сама папка. O(n · глубина).
const mixed = computed(() => {
  const set = new Set();
  for (const f of all.value) {
    if (f.isRoot) continue;
    const own = isOn(f.rel);
    const parts = f.rel.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const anc = parts.slice(0, i).join('/');
      if (isOn(anc) !== own) set.add(anc);
    }
  }
  return set;
});
const isMixed = (f) => !f.isRoot && mixed.value.has(f.rel);

function commit(set) {
  emit('update:modelValue', [...set]);
}

// Щелчок по папке переключает её вместе со всеми вложенными.
function toggle(f) {
  const set = new Set(off.value);
  const turnOn = !isOn(f.rel) || isMixed(f);
  for (const r of [f.rel, ...(f.isRoot ? [] : descendants(f.rel).map((d) => d.rel))]) {
    if (turnOn) set.delete(r);
    else set.add(r);
  }
  commit(set);
}

const allOn = computed(() => rows.value.length > 0 && rows.value.every((f) => isOn(f.rel)));
const someOn = computed(() => !allOn.value && rows.value.some((f) => isOn(f.rel)));

function setVisible(on) {
  const set = new Set(off.value);
  for (const f of rows.value) {
    if (on) set.delete(f.rel);
    else set.add(f.rel);
  }
  commit(set);
}

const summary = computed(() => {
  const total = all.value.length;
  const disabled = all.value.filter((f) => !isOn(f.rel)).length;
  if (!disabled) return 'все включены';
  if (disabled === total) return 'все отключены';
  return `отключено ${disabled} из ${total}`;
});
</script>

<style scoped>
.ft {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.ft__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ft__summary {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.ft__list {
  flex: 1;
  min-height: 90px;
  overflow-y: auto;
  border-radius: var(--r);
  background: var(--panel-2);
  box-shadow: inset 0 0 0 1px var(--line);
  padding: 4px 0;
}

.ft__empty {
  padding: 24px;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
}

.ft__item {
  height: 30px;
  padding-right: 12px;
}

.ft__item:hover {
  background: var(--panel-3);
}

.ft__item.is-off span {
  color: var(--text-3);
}

.ft__icon {
  color: var(--text-3);
}

.ft__count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
}

.check {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  color: var(--text);
  min-width: 0;
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
  border: 0;
  transform: none;
}
</style>
