<template>
  <div class="app" :class="`os-${platform}`">
    <TitleBar />
    <main class="workspace">
      <QueuePanel class="workspace__queue" />
      <Inspector class="workspace__inspector" />
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
import { toast } from './store/toast';
import { useAddActions } from './composables/useAddActions';
import Icon from './components/ui/Icon.vue';
import TitleBar from './components/TitleBar.vue';
import QueuePanel from './components/QueuePanel.vue';
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
  if (paths.length) await addPaths(paths, { recursive: true });
}

// ——— Горячие клавиши ———
const modalOpen = () => ui.cropId || ui.previewId || ui.folderImport || ui.presetDialog || ui.shortcuts;
const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;

function onKey(e) {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'o') {
    e.preventDefault();
    e.shiftKey ? addFolder() : addFiles();
    return;
  }
  if (mod && key === 'enter') {
    e.preventDefault();
    if (!queue.running && !modalOpen()) startConversion();
    return;
  }
  if (modalOpen() || isTyping(e)) return;
  if (mod && key === 'v') {
    e.preventDefault();
    pasteFromClipboard();
  } else if (key === 'escape' && queue.running) {
    cancelConversion();
  } else if ((key === 'delete' || key === 'backspace') && selectedItem.value && !queue.running) {
    removeItem(selectedItem.value.id);
  } else if (key === 'arrowdown' || key === 'arrowup') {
    const list = visibleItems.value;
    if (!list.length) return;
    e.preventDefault();
    const i = list.findIndex((it) => it.id === queue.selectedId);
    const next = key === 'arrowdown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
    queue.selectedId = list[next].id;
    document.querySelector(`[data-row="${list[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
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
  offOpen = api.onOpenPaths((paths) => addPaths(paths, { recursive: true }));
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

.workspace__queue {
  flex: 1;
  min-width: 0;
}

.workspace__inspector {
  width: var(--inspector-w);
  flex: none;
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
