<template>
  <header class="titlebar" @dblclick.self="toggleMax">
    <div class="titlebar__brand">
      <img class="titlebar__logo" src="../assets/logo.png" alt="" draggable="false" />
      <span v-if="!ui.narrow" class="titlebar__name">Hzconv</span>
    </div>

    <div class="titlebar__center" @dblclick.self="toggleMax">
      <UiSegmented
        v-model="ui.mode"
        small
        class="titlebar__mode"
        :options="[
          { value: 'files', label: ui.narrow ? '' : 'Файлы', icon: 'files', hint: 'Штучно: очередь, превью, кадрирование', disabled: busy && ui.mode !== 'files' },
          { value: 'batch', label: ui.narrow ? '' : 'Пакет', icon: 'layers', hint: 'Пакетно: сохранённые задания для папок', disabled: busy && ui.mode !== 'batch' }
        ]"
      />
      <span v-if="busy && !ui.compact" class="titlebar__status">
        <span class="titlebar__pulse" />
        <span class="num">{{ statusText }}</span>
      </span>
    </div>

    <div class="titlebar__actions">
      <UiButton variant="ghost" size="s" icon="keyboard" title="Горячие клавиши (?)" @click="ui.shortcuts = true" />
      <UiButton variant="ghost" size="s" :icon="themeIcon" :title="themeTitle" @click="cycleTheme" />
    </div>

    <div v-if="platform === 'linux'" class="titlebar__controls">
      <button class="wc" type="button" title="Свернуть" @click="api.window('minimize')"><Icon name="minimize" :size="14" /></button>
      <button class="wc" type="button" :title="maximized ? 'Восстановить' : 'Развернуть'" @click="toggleMax">
        <Icon :name="maximized ? 'restore' : 'maximize'" :size="14" />
      </button>
      <button class="wc wc--close" type="button" title="Закрыть" @click="api.window('close')"><Icon name="close" :size="14" /></button>
    </div>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, platform } from '../api';
import { ui } from '../store/ui';
import { queue } from '../store/queue';
import { batch } from '../store/batch';
import UiSegmented from './ui/UiSegmented.vue';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';

const maximized = ref(false);
let off = null;

onMounted(() => {
  off = api.onWindowState((s) => (maximized.value = s.maximized));
});
onBeforeUnmount(() => off?.());

const toggleMax = () => {
  if (platform !== 'darwin') api.window('toggle-maximize');
};

const busy = computed(() => queue.running || batch.running);
const nf = new Intl.NumberFormat('ru-RU');
const statusText = computed(() => {
  if (batch.running) {
    const p = batch.progress;
    return p ? `${nf.format(p.done + p.failed + p.skipped + p.cancelled)} / ${nf.format(p.total)}` : '';
  }
  const ids = new Set(queue.runIds);
  const done = queue.items.filter((it) => ids.has(it.id) && ['done', 'error', 'skipped', 'cancelled'].includes(it.status)).length;
  return `${done} / ${queue.runIds.length}`;
});

const order = ['system', 'light', 'dark'];
const themeIcon = computed(() => ({ system: 'monitor', light: 'sun', dark: 'moon' })[ui.theme]);
const themeTitle = computed(() => `Тема: ${{ system: 'как в системе', light: 'светлая', dark: 'тёмная' }[ui.theme]}`);
const cycleTheme = () => {
  ui.theme = order[(order.indexOf(ui.theme) + 1) % order.length];
};
</script>

<style scoped>
.titlebar {
  height: var(--titlebar-h);
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px 0 16px;
  -webkit-app-region: drag;
}

.os-darwin .titlebar {
  padding-left: 84px;
}

.is-narrow .titlebar {
  gap: 6px;
  padding-left: 12px;
}

/* Место под нативные кнопки Windows (titleBarOverlay) */
.os-win32 .titlebar {
  padding-right: 146px;
}

.titlebar__brand {
  display: flex;
  align-items: center;
  gap: 9px;
}

.titlebar__logo {
  width: 18px;
  height: 18px;
  border-radius: 5px;
}

.titlebar__name {
  font-size: 13px;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.titlebar__center {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.titlebar__mode {
  -webkit-app-region: no-drag;
  flex: none;
}

.titlebar__mode :deep(.seg__item) {
  padding: 0 12px;
}

.titlebar__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}

.titlebar__pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1.4s var(--ease) infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

.titlebar__actions,
.titlebar__controls {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.titlebar__controls {
  margin-left: 6px;
  gap: 4px;
}

.wc {
  width: 30px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-s);
  background: transparent;
  color: var(--text-2);
}

.wc:hover {
  background: var(--panel-3);
  color: var(--text);
}

.wc--close:hover {
  background: var(--err);
  color: #fff;
}
</style>
