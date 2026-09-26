<template>
  <div class="app" :class="[`os-${platform}`, { 'is-compact': ui.compact, 'is-narrow': ui.narrow }]">
    <TitleBar />
    <main class="workspace">
      <div class="workspace__main">
        <QueuePanel v-if="ui.mode === 'files'" class="workspace__panel" />
        <BatchPanel v-else class="workspace__panel" />
        <CompactBar v-if="ui.compact" />
      </div>
      <Transition name="fade">
        <div v-if="ui.compact && ui.settingsOpen" class="drawer-scrim" @click="ui.settingsOpen = false" />
      </Transition>
      <Inspector class="workspace__inspector" :class="{ 'is-drawer': ui.compact, 'is-open': ui.settingsOpen }" />
    </main>

    <Transition name="fade">
      <div v-if="ui.dragging" class="drop-overlay">
        <div class="drop-overlay__frame">
          <Icon name="plus" :size="22" />
          <span>Отпустите, чтобы добавить</span>
          <small>Файлы и папки целиком</small>
        </div>
      </div>
    </Transition>

    <CropEditor />
    <PreviewModal />
    <FolderImport />
    <ShortcutsDialog />
    <Toasts />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { api, platform } from './api';
import { ui, applyTheme } from './store/ui';
import { queue, addPaths, removeItem, startConversion, cancelConversion, selectedItem, visibleItems } from './store/queue';
import { batch, createJob, runJob } from './store/batch';
import { toast } from './store/toast';
import { useAddActions } from './composables/useAddActions';
import Icon from './components/ui/Icon.vue';
import TitleBar from './components/TitleBar.vue';
import QueuePanel from './components/QueuePanel.vue';
import BatchPanel from './components/BatchPanel.vue';
import CompactBar from './components/CompactBar.vue';
import Inspector from './components/Inspector.vue';
import CropEditor from './components/CropEditor.vue';
import PreviewModal from './components/PreviewModal.vue';
import FolderImport from './components/FolderImport.vue';
import ShortcutsDialog from './components/ShortcutsDialog.vue';
import Toasts from './components/Toasts.vue';

const { addFiles, addFolder, pasteFromClipboard } = useAddActions();

// ——— Drag & drop на всё окно ———
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

function onDragEnter(e) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  ui.dragging = true;
}
function onDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = hasFiles(e) ? 'copy' : 'none';
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) ui.dragging = false;
}
async function onDrop(e) {
  e.preventDefault();
  dragDepth = 0;
  ui.dragging = false;
  const paths = [...(e.dataTransfer?.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
  if (!paths.length || queue.running || batch.running) return;
  // В пакетном режиме одна папка становится папкой задания.
  if (ui.mode === 'batch' && paths.length === 1 && (await api.pathKind(paths[0])) === 'dir') {
    const job = await createJob(paths[0]);
    if (job) toast(`Задание «${job.name}»`, { kind: 'ok' });
    return;
  }
  if (ui.mode === 'batch') ui.mode = 'files';
  await addPaths(paths, { recursive: true });
}

// ——— Горячие клавиши ———
const modalOpen = () => ui.cropId || ui.previewId || ui.folderImport || ui.presetDialog || ui.shortcuts;
const busy = () => queue.running || batch.running;
const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;

function onKey(e) {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'o') {
    e.preventDefault();
    if (busy()) return;
    ui.mode = 'files';
    e.shiftKey ? addFolder() : addFiles();
    return;
  }
  if (mod && key === 'enter') {
    e.preventDefault();
    if (busy() || modalOpen()) return;
    if (ui.mode === 'batch') runJob();
    else startConversion();
    return;
  }
  if (key === 'escape' && ui.settingsOpen) {
    ui.settingsOpen = false;
    return;
  }
  if (modalOpen() || isTyping(e)) return;
  if (key === 'escape' && busy()) {
    if (batch.running) api.cancel();
    else cancelConversion();
    return;
  }
  if (ui.mode === 'batch') return;
  if (mod && key === 'v') {
    e.preventDefault();
    pasteFromClipboard();
  } else if ((key === 'delete' || key === 'backspace') && selectedItem.value && !queue.running) {
    removeItem(selectedItem.value.id);
  } else if (key === 'arrowdown' || key === 'arrowup') {
    const list = visibleItems.value;
    if (!list.length) return;
    e.preventDefault();
    const i = list.findIndex((it) => it.id === queue.selectedId);
    const next = key === 'arrowdown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
    queue.selectedId = list[next].id;
    window.dispatchEvent(new CustomEvent('queue:reveal', { detail: next }));
  } else if (key === ' ' && selectedItem.value?.type === 'image') {
    e.preventDefault();
    ui.previewId = selectedItem.value.id;
  } else if (key === 'c' && selectedItem.value && selectedItem.value.type !== 'audio') {
    ui.cropId = selectedItem.value.id;
  } else if (key === '?' || (e.shiftKey && key === '/')) {
    ui.shortcuts = true;
  }
}

let offOpen = null;

onMounted(() => {
  applyTheme();
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('keydown', onKey);
  api.onEngineCrash(() => toast('Процесс обработки перезапущен после сбоя. Подробности — в журнале ошибок', { kind: 'error', timeout: 8000 }));
  offOpen = api.onOpenPaths((paths) => {
    if (busy()) return;
    ui.mode = 'files';
    addPaths(paths, { recursive: true });
  });
  api
    .info()
    .then((info) => {
      if (!info.ffmpeg) toast('FFmpeg не найден — видео и аудио недоступны', { kind: 'error', timeout: 8000 });
    })
    .catch(() => {});
});

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('drop', onDrop);
  window.removeEventListener('keydown', onKey);
  offOpen?.();
});
</script>

<style>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  padding: 0 8px 8px;
}

.workspace__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace__panel {
  flex: 1;
  min-height: 0;
}

.workspace__inspector {
  width: var(--inspector-w);
  flex: none;
}

/* Компактное окно: настройки выезжают поверх, как панель */
.workspace__inspector.is-drawer {
  position: fixed;
  z-index: 1500;
  top: var(--titlebar-h);
  right: 8px;
  bottom: 8px;
  width: min(var(--inspector-w), calc(100vw - 16px));
  padding: 8px;
  border-radius: 16px;
  background: var(--bg);
  box-shadow: var(--shadow-pop);
  transform: translateX(calc(100% + 16px));
  visibility: hidden;
  transition: transform 240ms var(--ease), visibility 0s linear 240ms;
}

.workspace__inspector.is-drawer.is-open {
  transform: none;
  visibility: visible;
  transition: transform 240ms var(--ease);
}

/* В компактном окне уведомления — по центру, над нижней панелью */
.is-compact .toasts {
  left: 50%;
  bottom: 84px;
  width: calc(100vw - 32px);
}

.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: var(--scrim);
}

.is-narrow .workspace {
  padding: 0 6px 6px;
}

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  padding: 10px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  pointer-events: none;
}

.drop-overlay__frame {
  height: 100%;
  border-radius: 14px;
  border: 1.5px solid var(--accent);
  background: var(--accent-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--accent);
  font-size: 15px;
  font-weight: 560;
}

.drop-overlay__frame small {
  font-size: 12.5px;
  font-weight: 400;
  color: var(--text-2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 140ms var(--ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
