<template>
  <div ref="root" class="select" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button
      class="select__trigger"
      type="button"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown.down.prevent="openAndFocus(1)"
      @keydown.up.prevent="openAndFocus(-1)"
    >
      <span class="select__value ellipsis">{{ current ? current.label : placeholder }}</span>
      <Icon name="chevron-down" :size="14" class="select__chevron" />
    </button>

    <Teleport to="body">
      <Transition name="pop">
        <ul
          v-if="open"
          ref="menu"
          class="select__menu"
          role="listbox"
          tabindex="-1"
          :style="menuStyle"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="choose(normalized[cursor])"
          @keydown.esc.prevent.stop="close(true)"
          @keydown.tab="close(false)"
        >
          <template v-for="(opt, i) in normalized" :key="opt.group ? `g-${opt.group}` : String(opt.value)">
            <li v-if="opt.group" class="select__group">{{ opt.group }}</li>
            <li
              v-else
              class="select__option"
              role="option"
              :aria-selected="opt.value === modelValue"
              :class="{ 'is-cursor': i === cursor, 'is-selected': opt.value === modelValue, 'is-disabled': opt.disabled }"
              @mouseenter="cursor = i"
              @click="choose(opt)"
            >
              <span class="select__label">
                <span class="ellipsis">{{ opt.label }}</span>
                <span v-if="opt.hint" class="select__hint ellipsis">{{ opt.hint }}</span>
              </span>
              <Icon v-if="opt.value === modelValue" name="check" :size="14" class="select__check" />
            </li>
          </template>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean, null], default: null },
  options: { type: Array, required: true }, // { value, label, hint?, disabled? } | { group }
  placeholder: { type: String, default: 'Выберите' },
  disabled: Boolean,
  menuWidth: { type: Number, default: 0 }
});
const emit = defineEmits(['update:modelValue']);

const root = ref(null);
const menu = ref(null);
const open = ref(false);
const cursor = ref(-1);
const menuStyle = ref({});

const normalized = computed(() => props.options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) })));
const current = computed(() => normalized.value.find((o) => !o.group && o.value === props.modelValue));

function place() {
  const r = root.value.getBoundingClientRect();
  const width = Math.max(r.width, props.menuWidth);
  const spaceBelow = window.innerHeight - r.bottom - 12;
  const maxH = 320;
  const above = spaceBelow < 200 && r.top > spaceBelow;
  menuStyle.value = {
    left: `${Math.min(r.left, window.innerWidth - width - 8)}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(maxH, above ? r.top - 12 : spaceBelow)}px`,
    ...(above ? { bottom: `${window.innerHeight - r.top + 4}px` } : { top: `${r.bottom + 4}px` })
  };
}

function onOutside(e) {
  if (!root.value?.contains(e.target) && !menu.value?.contains(e.target)) close(false);
}

async function openMenu() {
  place();
  open.value = true;
  cursor.value = normalized.value.findIndex((o) => !o.group && o.value === props.modelValue);
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('resize', onResize);
  await nextTick();
  menu.value?.focus();
  menu.value?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
}

function onResize() {
  close(false);
}

function close(focusTrigger) {
  open.value = false;
  document.removeEventListener('mousedown', onOutside, true);
  window.removeEventListener('resize', onResize);
  if (focusTrigger) root.value?.querySelector('.select__trigger')?.focus();
}

function toggle() {
  open.value ? close(false) : openMenu();
}

async function openAndFocus(dir) {
  if (!open.value) await openMenu();
  else move(dir);
}

function move(dir) {
  const list = normalized.value;
  let i = cursor.value;
  for (let n = 0; n < list.length; n++) {
    i = (i + dir + list.length) % list.length;
    if (!list[i].group && !list[i].disabled) break;
  }
  cursor.value = i;
  nextTick(() => menu.value?.querySelector('.is-cursor')?.scrollIntoView({ block: 'nearest' }));
}

function choose(opt) {
  if (!opt || opt.group || opt.disabled) return;
  emit('update:modelValue', opt.value);
  close(true);
}

onBeforeUnmount(() => close(false));
</script>

<style scoped>
.select {
  position: relative;
  min-width: 0;
}

.select__trigger {
  width: 100%;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 10px;
  background: var(--panel-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-s);
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  box-shadow: var(--shadow-control);
  transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
}

.select__trigger:hover:not(:disabled) {
  background: var(--panel-3);
}

.is-open .select__trigger {
  border-color: var(--accent-line);
}

.select__value {
  flex: 1;
}

.select__chevron {
  color: var(--text-3);
  transition: transform var(--t) var(--ease);
}

.is-open .select__chevron {
  transform: rotate(180deg);
}

.is-disabled {
  opacity: 0.45;
}
</style>

<style>
.select__menu {
  position: fixed;
  z-index: 3000;
  margin: 0;
  padding: 4px;
  list-style: none;
  overflow-y: auto;
  background: var(--panel-raised);
  border-radius: var(--r);
  box-shadow: var(--shadow-pop);
}

.select__group {
  padding: 8px 8px 4px;
  font-size: 11px;
  font-weight: 560;
  color: var(--text-3);
}

.select__group:first-child {
  padding-top: 4px;
}

.select__option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 12.5px;
  color: var(--text);
}

.select__option.is-cursor {
  background: var(--panel-3);
}

.select__option.is-disabled {
  opacity: 0.4;
}

.select__label {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.select__hint {
  font-size: 11.5px;
  color: var(--text-3);
}

.select__check {
  color: var(--accent);
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 120ms var(--ease), transform 120ms var(--ease);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
