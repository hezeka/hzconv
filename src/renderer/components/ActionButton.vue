<template>
  <div v-if="running" class="run">
    <div class="run__bar"><div class="run__fill" :style="{ transform: `scaleX(${ratio})` }" /></div>
    <div class="run__row">
      <span class="num">{{ Math.floor(ratio * 100) }}%</span>
      <UiButton icon="stop" @click="stop">Остановить</UiButton>
    </div>
  </div>
  <UiButton v-else variant="primary" size="l" block :icon="ui.mode === 'batch' ? 'play' : ''" :disabled="disabled" @click="start">
    {{ label }}
    <template v-if="!ui.narrow" #trail><kbd class="kbd">{{ mod }} ↵</kbd></template>
  </UiButton>
</template>

<script setup>
import { computed } from 'vue';
import { platform, api } from '../api';
import { ui } from '../store/ui';
import { queue, progress, startConversion, cancelConversion } from '../store/queue';
import { batch, activeJob, runJob } from '../store/batch';
import { files } from '../utils/format';
import UiButton from './ui/UiButton.vue';

const mod = platform === 'darwin' ? '⌘' : 'Ctrl';
const nf = new Intl.NumberFormat('ru-RU');

const running = computed(() => (ui.mode === 'batch' ? batch.running : queue.running));
const ratio = computed(() => {
  if (ui.mode !== 'batch') return progress.value;
  const p = batch.progress;
  if (!p?.total) return 0;
  return Math.min(1, (p.done + p.failed + p.skipped + p.cancelled) / p.total);
});

const disabled = computed(() => (ui.mode === 'batch' ? !activeJob.value?.source.dir : !queue.items.length));

const label = computed(() => {
  if (ui.mode === 'batch') {
    const n = batch.stats?.count;
    return n ? `Запустить · ${nf.format(n)} ${files(n).split(' ').pop()}` : 'Запустить задание';
  }
  return queue.items.length ? `Конвертировать ${files(queue.items.length)}` : 'Конвертировать';
});

function start() {
  if (ui.mode === 'batch') runJob();
  else startConversion();
}

function stop() {
  if (ui.mode === 'batch') api.cancel();
  else cancelConversion();
}
</script>

<style scoped>
.kbd {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.85);
  font-size: 10px;
}

.run {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.run__bar {
  height: 4px;
  border-radius: 3px;
  background: var(--panel-3);
  overflow: hidden;
}

.run__fill {
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 240ms linear;
}

.run__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-2);
}
</style>
