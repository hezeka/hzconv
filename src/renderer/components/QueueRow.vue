<template>
  <div
    ref="el"
    class="row"
    :class="[`row--${item.status}`, { 'is-selected': queue.selectedId === item.id }]"
    :data-row="item.id"
    role="option"
    :aria-selected="queue.selectedId === item.id"
    :title="item.path"
    @click="queue.selectedId = item.id"
    @dblclick="openEditor"
  >
    <div class="row__thumb" :class="{ checker: item.details?.hasAlpha }">
      <img v-if="item.details?.thumb" :src="item.details.thumb" alt="" draggable="false" />
      <Icon v-else :name="typeIcon" :size="17" />
      <span v-if="item.edit" class="row__badge" title="Изменён кадр или поворот"><Icon name="crop" :size="10" :stroke="2" /></span>
    </div>

    <div class="row__main">
      <div class="row__name ellipsis">{{ item.name }}</div>

      <div v-if="item.status === 'done'" class="row__meta">
        <span class="num">{{ formatBytes(item.size) }}</span>
        <Icon name="arrow" :size="12" class="row__arrow" />
        <span class="num row__strong">{{ formatBytes(item.outputSize) }}</span>
        <span class="row__delta num" :class="item.outputSize <= item.size ? 'is-good' : 'is-bad'">{{ formatDelta(item.size, item.outputSize) }}</span>
        <span v-if="item.outputs?.length > 1" class="faint">{{ files(item.outputs.length) }}</span>
        <span v-else-if="outDims" class="faint num">{{ outDims }}</span>
        <span class="faint num">{{ formatElapsed(item.elapsed) }}</span>
      </div>
      <div v-else-if="item.status === 'error'" class="row__meta row__meta--error ellipsis" :title="item.error">{{ item.error }}</div>
      <div v-else-if="item.status === 'skipped'" class="row__meta faint">Пропущен — {{ (item.error || 'файл уже существует').toLowerCase() }}</div>
      <div v-else-if="item.status === 'cancelled'" class="row__meta faint">Остановлено</div>
      <div v-else-if="item.status === 'processing'" class="row__meta">
        <span v-if="item.progress > 0" class="num">{{ Math.round(item.progress * 100) }}%</span>
        <span class="faint">{{ item.type === 'image' ? 'обработка' : 'кодирование' }}</span>
      </div>
      <div v-else class="row__meta">
        <span>{{ item.ext.toUpperCase() }}</span>
        <span v-if="dims" class="num">{{ dims }}</span>
        <span v-if="item.details?.duration" class="num">{{ formatDuration(item.details.duration) }}</span>
        <span v-if="item.details?.animated" class="faint">анимация · {{ item.details.frames }} кадр.</span>
        <span class="num">{{ formatBytes(item.size) }}</span>
        <span v-if="item.status === 'queued'" class="faint">в очереди</span>
      </div>
    </div>

    <div class="row__side">
      <div class="row__actions">
        <UiButton v-if="item.type === 'image'" variant="ghost" size="s" icon="compare" title="Предпросмотр результата (пробел)" @click.stop="ui.previewId = item.id" />
        <UiButton v-if="item.type !== 'audio'" variant="ghost" size="s" icon="crop" title="Кадр, поворот и отражение (C)" :disabled="queue.running" @click.stop="openEditor" />
        <UiButton variant="ghost" size="s" icon="reveal" :title="item.outputs?.length ? 'Показать результат в папке' : 'Показать в папке'" @click.stop="reveal" />
        <UiButton variant="ghost" size="s" icon="close" title="Убрать из очереди (Delete)" :disabled="queue.running" @click.stop="removeItem(item.id)" />
      </div>
      <div class="row__state">
        <span v-if="item.status === 'done'" class="row__ok"><Icon name="check" :size="15" :stroke="2" /></span>
        <span v-else-if="item.status === 'error'" class="row__err"><Icon name="alert" :size="15" /></span>
        <span v-else-if="item.status === 'skipped'" class="faint"><Icon name="skip" :size="15" /></span>
        <svg v-else-if="item.status === 'processing'" class="ring" :class="{ 'ring--spin': !item.progress }" viewBox="0 0 20 20" width="18" height="18">
          <circle cx="10" cy="10" r="7.5" class="ring__bg" />
          <circle cx="10" cy="10" r="7.5" class="ring__fg" :style="{ strokeDashoffset: item.progress ? 47.1 * (1 - item.progress) : 35 }" />
        </svg>
        <span v-else class="row__target mono" :class="{ 'is-invalid': target.invalid }" :title="target.invalid || `Будет сохранено как ${target.label}`">{{ target.label }}</span>
      </div>
    </div>

    <div v-if="item.status === 'processing' && item.progress > 0" class="row__bar" :style="{ transform: `scaleX(${item.progress})` }" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
import { ui } from '../store/ui';
import { settings } from '../store/settings';
import { queue, loadDetails, removeItem } from '../store/queue';
import { targetFor } from '../utils/targets';
import { formatBytes, formatDelta, formatDims, formatDuration, formatElapsed, files } from '../utils/format';
import { observeVisible } from '../utils/visibility';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';

const props = defineProps({ item: { type: Object, required: true } });

const el = ref(null);
let stop = null;

onMounted(() => {
  stop = observeVisible(el.value, () => loadDetails(props.item));
});
onBeforeUnmount(() => stop?.());

const typeIcon = computed(() => ({ image: 'image', video: 'film', audio: 'music' })[props.item.type]);
const dims = computed(() => formatDims(props.item.details?.width, props.item.details?.height));
const outDims = computed(() => {
  const o = props.item.outputs?.[0];
  return o && o.width ? formatDims(o.width, o.height) : '';
});
const target = computed(() => targetFor(props.item, settings));

function openEditor() {
  if (props.item.type !== 'audio' && !queue.running) ui.cropId = props.item.id;
}

function reveal() {
  api.reveal(props.item.outputs?.[0]?.path || props.item.path);
}
</script>

<style scoped>
.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 58px;
  margin: 0 6px;
  padding: 0 8px;
  border-radius: var(--r);
  content-visibility: auto;
  contain-intrinsic-size: auto 58px;
  transition: background var(--t-fast) var(--ease);
}

.row:hover {
  background: var(--panel-2);
}

.row.is-selected {
  background: var(--panel-3);
}

.row__thumb {
  position: relative;
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--panel-3);
  color: var(--text-3);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--line);
}

.row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row__badge {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
}

.row__main {
  flex: 1;
  min-width: 0;
}

.row__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.row__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
}

.row__meta--error {
  display: block;
  color: var(--err);
}

.row__arrow {
  color: var(--text-3);
  margin: 0 -4px;
}

.row__strong {
  color: var(--text);
}

.row__delta {
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10.5px;
  line-height: 17px;
}

.row__delta.is-good {
  background: var(--ok-soft);
  color: var(--ok);
}

.row__delta.is-bad {
  background: var(--warn-soft);
  color: var(--warn);
}

.faint {
  color: var(--text-3);
}

.row__side {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.row__actions {
  display: flex;
  gap: 1px;
  opacity: 0;
  transition: opacity var(--t-fast) var(--ease);
}

.row:hover .row__actions,
.row.is-selected .row__actions,
.row:focus-within .row__actions {
  opacity: 1;
}

.row__state {
  width: 44px;
  display: flex;
  justify-content: flex-end;
}

.row__target {
  font-size: 10.5px;
  color: var(--text-3);
  padding: 2px 5px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px var(--line-2);
}

.row__target.is-invalid {
  color: var(--warn);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--warn) 45%, transparent);
}

.row__ok {
  color: var(--ok);
}

.row__err {
  color: var(--err);
}

.ring {
  transform: rotate(-90deg);
}

.ring circle {
  fill: none;
  stroke-width: 2;
}

.ring__bg {
  stroke: var(--line-2);
}

.ring__fg {
  stroke: var(--accent);
  stroke-dasharray: 47.1;
  stroke-linecap: round;
  transition: stroke-dashoffset 200ms linear;
}

.ring--spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(-90deg);
  }
  to {
    transform: rotate(270deg);
  }
}

.row__bar {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 3px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
  transform-origin: left;
  transition: transform 200ms linear;
  opacity: 0.7;
}

.row--queued .row__main {
  opacity: 0.75;
}
</style>
