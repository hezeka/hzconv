<template>
  <section class="queue panel">
    <EmptyState v-if="!queue.items.length" />

    <template v-else>
      <div class="queue__toolbar">
        <UiSegmented v-model="queue.filter" small class="queue__filter" :options="filterOptions" />
        <div class="queue__tools">
          <UiButton variant="ghost" size="s" icon="plus" title="Добавить файлы (Ctrl+O)" :disabled="queue.running" @click="addFiles" />
          <UiButton variant="ghost" size="s" icon="folder" title="Добавить папку (Ctrl+Shift+O)" :disabled="queue.running" @click="addFolder" />
          <span class="queue__sep" />
          <UiButton v-if="counts.done" variant="ghost" size="s" :icon="ui.narrow ? 'check' : ''" title="Убрать готовые" :disabled="queue.running" @click="removeFinished">{{ ui.narrow ? '' : 'Убрать готовые' }}</UiButton>
          <UiButton variant="ghost" size="s" icon="trash" title="Очистить очередь" :disabled="queue.running" @click="clearQueue" />
        </div>
      </div>

      <div ref="list" class="queue__list" role="listbox" aria-label="Очередь файлов" @scroll="onScroll">
        <!-- Рендерятся только видимые строки: очередь на тысячи файлов не тормозит -->
        <div class="queue__spacer" :style="{ height: `${visibleItems.length * ROW}px` }">
          <div class="queue__window" :style="{ transform: `translateY(${range.start * ROW}px)` }">
            <QueueRow v-for="item in windowItems" :key="item.id" :item="item" />
          </div>
        </div>
        <div v-if="!visibleItems.length" class="queue__nothing">Нет файлов этого типа</div>
      </div>

      <footer class="queue__footer">
        <template v-if="queue.summary && !queue.running">
          <div class="sum" :class="{ 'sum--narrow': ui.narrow }">
            <Icon :name="summaryIcon" :size="15" :class="`sum__icon sum__icon--${summaryKind}`" />
            <span>
              Готово <b class="num">{{ queue.summary.done }}</b> из <span class="num">{{ queue.summary.total }}</span>
            </span>
            <span v-if="queue.summary.done" class="sum__bytes num">
              {{ formatBytes(queue.summary.inputBytes) }} → {{ formatBytes(queue.summary.outputBytes) }}
              <span :class="saved ? 'good' : 'faint'">{{ formatDelta(queue.summary.inputBytes, queue.summary.outputBytes) }}</span>
            </span>
            <span v-if="queue.summary.failed" class="bad">ошибок: {{ queue.summary.failed }}</span>
            <span v-if="queue.summary.skipped" class="faint">пропущено: {{ queue.summary.skipped }}</span>
            <span class="faint num">{{ formatElapsed(queue.summary.elapsed) }}</span>
          </div>
          <div class="queue__footer-actions">
            <UiButton v-if="queue.summary.failed || queue.summary.cancelled" size="s" icon="refresh" @click="retryFailed">Повторить</UiButton>
            <UiButton v-if="queue.summary.outputDirs.length" size="s" icon="reveal" @click="revealOutput">Открыть папку</UiButton>
          </div>
        </template>
        <template v-else>
          <div class="sum faint">
            <span>{{ files(counts.all) }}</span>
            <span class="num">{{ formatBytes(counts.bytes) }}</span>
            <span v-if="!queue.running && !ui.compact" class="queue__hint">Двойной щелчок — кадрирование, пробел — предпросмотр</span>
          </div>
        </template>
      </footer>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../api';
import { queue, counts, visibleItems, clearQueue, removeFinished, retryFailed } from '../store/queue';
import { useAddActions } from '../composables/useAddActions';
import { ui } from '../store/ui';
import { files, formatBytes, formatDelta, formatElapsed } from '../utils/format';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';
import UiSegmented from './ui/UiSegmented.vue';
import QueueRow from './QueueRow.vue';
import EmptyState from './EmptyState.vue';

const { addFiles, addFolder } = useAddActions();

// ——— Виртуальный список ———
const ROW = 58;
const list = ref(null);
const scrollTop = ref(0);
const viewport = ref(600);
let ro = null;

const range = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / ROW) - 6);
  const end = Math.min(visibleItems.value.length, Math.ceil((scrollTop.value + viewport.value) / ROW) + 6);
  return { start, end };
});
const windowItems = computed(() => visibleItems.value.slice(range.value.start, range.value.end));

function onScroll() {
  scrollTop.value = list.value.scrollTop;
}

function reveal(e) {
  const el = list.value;
  if (!el) return;
  const top = e.detail * ROW;
  if (top < el.scrollTop) el.scrollTop = top;
  else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight + 8;
}

watch(list, (el) => {
  ro?.disconnect();
  if (!el) return;
  ro = new ResizeObserver(() => (viewport.value = el.clientHeight));
  ro.observe(el);
  scrollTop.value = el.scrollTop;
});
watch(() => queue.filter, () => list.value && (list.value.scrollTop = 0));
onMounted(() => window.addEventListener('queue:reveal', reveal));
onBeforeUnmount(() => {
  window.removeEventListener('queue:reveal', reveal);
  ro?.disconnect();
});

const filterOptions = computed(() => {
  const c = counts.value;
  const opts = [{ value: 'all', label: 'Все', count: c.all }];
  if (c.image) opts.push({ value: 'image', label: ui.narrow ? 'Фото' : 'Изображения', count: c.image });
  if (c.video) opts.push({ value: 'video', label: 'Видео', count: c.video });
  if (c.audio) opts.push({ value: 'audio', label: 'Аудио', count: c.audio });
  return opts;
});

const saved = computed(() => queue.summary && queue.summary.outputBytes < queue.summary.inputBytes);
const summaryKind = computed(() => {
  const s = queue.summary;
  if (!s) return 'ok';
  if (s.failed && !s.done) return 'bad';
  if (s.failed || s.wasCancelled) return 'warn';
  return 'ok';
});
const summaryIcon = computed(() => ({ ok: 'check', warn: 'alert', bad: 'alert' })[summaryKind.value]);

function revealOutput() {
  const first = queue.items.find((it) => it.outputs?.length);
  if (first) api.reveal(first.outputs[0].path);
}
</script>

<style scoped>
.panel {
  background: var(--panel);
  border-radius: var(--r-l);
  box-shadow: 0 0 0 1px var(--line);
  overflow: hidden;
}

.queue {
  display: flex;
  flex-direction: column;
}

.queue__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 10px 10px 12px;
  border-bottom: 1px solid var(--line);
}

.queue__filter {
  flex: 0 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.queue__filter::-webkit-scrollbar {
  display: none;
}

.queue__filter :deep(.seg__item) {
  flex: 0 0 auto;
  padding: 0 10px;
}

.queue__tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}

.queue__sep {
  width: 1px;
  height: 16px;
  margin: 0 6px;
  background: var(--line-2);
}

.queue__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.queue__spacer {
  position: relative;
}

.queue__window {
  will-change: transform;
}

.queue__nothing {
  padding: 40px;
  text-align: center;
  color: var(--text-3);
}

.queue__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 6px 10px 6px 16px;
  border-top: 1px solid var(--line);
  font-size: 12px;
}

.sum {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  white-space: nowrap;
  overflow: hidden;
}

.sum--narrow .sum__bytes + *,
.sum--narrow > .faint {
  display: none;
}

.sum b {
  font-weight: 600;
}

.sum__icon--ok {
  color: var(--ok);
}
.sum__icon--warn {
  color: var(--warn);
}
.sum__icon--bad {
  color: var(--err);
}

.sum__bytes {
  color: var(--text-2);
}

.good {
  color: var(--ok);
  margin-left: 4px;
}

.bad {
  color: var(--err);
}

.faint {
  color: var(--text-3);
}

.queue__hint {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue__footer-actions {
  display: flex;
  gap: 6px;
}
</style>
