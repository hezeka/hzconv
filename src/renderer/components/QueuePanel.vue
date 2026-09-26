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
          <UiButton v-if="counts.done" variant="ghost" size="s" :disabled="queue.running" @click="removeFinished">Убрать готовые</UiButton>
          <UiButton variant="ghost" size="s" icon="trash" title="Очистить очередь" :disabled="queue.running" @click="clearQueue" />
        </div>
      </div>

      <div ref="list" class="queue__list" role="listbox" aria-label="Очередь файлов">
        <QueueRow v-for="item in visibleItems" :key="item.id" :item="item" />
        <div v-if="!visibleItems.length" class="queue__nothing">Нет файлов этого типа</div>
      </div>

      <footer class="queue__footer">
        <template v-if="queue.summary && !queue.running">
          <div class="sum">
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
            <span v-if="!queue.running" class="queue__hint">Двойной щелчок — кадрирование, пробел — предпросмотр</span>
          </div>
        </template>
      </footer>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { api } from '../api';
import { queue, counts, visibleItems, clearQueue, removeFinished, retryFailed } from '../store/queue';
import { useAddActions } from '../composables/useAddActions';
import { files, formatBytes, formatDelta, formatElapsed } from '../utils/format';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';
import UiSegmented from './ui/UiSegmented.vue';
import QueueRow from './QueueRow.vue';
import EmptyState from './EmptyState.vue';

const { addFiles, addFolder } = useAddActions();

const filterOptions = computed(() => {
  const c = counts.value;
  const opts = [{ value: 'all', label: 'Все', count: c.all }];
  if (c.image) opts.push({ value: 'image', label: 'Изображения', count: c.image });
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
