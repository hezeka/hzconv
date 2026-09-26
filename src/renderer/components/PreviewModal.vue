<template>
  <UiModal :open="Boolean(item)" size="full" flush @close="close">
    <template #header>
      <div class="pv-head">
        <div class="pv-head__nav">
          <UiButton variant="ghost" size="s" icon="chevron-left" title="Предыдущее изображение" :disabled="!prevItem" @click="ui.previewId = prevItem.id" />
          <UiButton variant="ghost" size="s" icon="chevron-right" title="Следующее изображение" :disabled="!nextItem" @click="ui.previewId = nextItem.id" />
        </div>
        <div class="pv-head__name ellipsis">{{ item?.name }}</div>

        <div class="pv-stats">
          <div class="pv-stat">
            <span class="pv-stat__label">Исходник</span>
            <span class="num">{{ formatBytes(result?.inputSize ?? item?.size) }}</span>
            <span v-if="item?.details" class="num faint">{{ formatDims(item.details.width, item.details.height) }}</span>
          </div>
          <Icon name="arrow" :size="14" class="faint" />
          <div class="pv-stat">
            <span class="pv-stat__label">{{ result ? result.format.toUpperCase() : 'Результат' }}</span>
            <template v-if="result">
              <span class="num pv-stat__main">{{ formatBytes(result.outputSize) }}</span>
              <span class="pv-delta num" :class="result.outputSize <= result.inputSize ? 'is-good' : 'is-bad'">{{ formatDelta(result.inputSize, result.outputSize) }}</span>
              <span class="num faint">{{ formatDims(result.width, result.height) }}</span>
            </template>
            <span v-else class="faint">{{ loading ? 'считаю…' : '—' }}</span>
          </div>
        </div>
      </div>
    </template>

    <div class="pv">
      <div ref="stage" class="pv-stage checker" :class="{ 'is-actual': zoom === 'actual' }" @pointerdown="onDown">
        <div v-if="error" class="pv-msg pv-msg--err">{{ error }}</div>
        <div v-else-if="!result" class="pv-msg">Кодирую с текущими настройками…</div>
        <div v-else class="pv-canvas" :style="canvasStyle">
          <img class="pv-img" :src="result.before" alt="" draggable="false" />
          <img class="pv-img pv-img--after" :src="result.after" alt="" draggable="false" :style="{ clipPath: `inset(0 0 0 ${split * 100}%)` }" />
          <div class="pv-split" :style="{ left: `${split * 100}%` }">
            <span class="pv-split__knob"><Icon name="chevron-left" :size="12" :stroke="2" /><Icon name="chevron-right" :size="12" :stroke="2" /></span>
          </div>
          <span class="pv-tag pv-tag--l">До</span>
          <span class="pv-tag pv-tag--r">После</span>
        </div>
        <div v-if="loading && result" class="pv-busy">Обновляю…</div>
      </div>

      <div class="pv-bar">
        <UiSegmented v-model="zoom" small :options="[{ value: 'fit', label: 'Вписать' }, { value: 'actual', label: '100%' }]" class="pv-bar__zoom" />
        <template v-if="hasQuality">
          <span class="pv-bar__label">Качество</span>
          <UiSlider v-model="settings.image.quality" :min="1" :max="100" class="pv-bar__slider" />
        </template>
        <span v-else class="pv-bar__label">Формат {{ result?.format?.toUpperCase() || '' }} без настройки качества</span>
        <span v-if="result?.downscaled" class="faint pv-bar__note">Показано уменьшенным, размер файла — реальный</span>
        <UiButton size="s" icon="sliders" class="pv-bar__settings" @click="toSettings">Все настройки</UiButton>
      </div>
    </div>
  </UiModal>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { api, errorText } from '../api';
import { ui } from '../store/ui';
import { settings } from '../store/settings';
import { queue, getItem, loadDetails } from '../store/queue';
import { formatBytes, formatDelta, formatDims } from '../utils/format';
import Icon from './ui/Icon.vue';
import UiModal from './ui/UiModal.vue';
import UiButton from './ui/UiButton.vue';
import UiSegmented from './ui/UiSegmented.vue';
import UiSlider from './ui/UiSlider.vue';

const item = computed(() => (ui.previewId ? getItem(ui.previewId) : null));
const images = computed(() => queue.items.filter((it) => it.type === 'image'));
const idx = computed(() => images.value.findIndex((it) => it.id === ui.previewId));
const prevItem = computed(() => images.value[idx.value - 1] || null);
const nextItem = computed(() => images.value[idx.value + 1] || null);

const result = ref(null);
const loading = ref(false);
const error = ref('');
const split = ref(0.5);
const zoom = ref('fit');
const stage = ref(null);

const hasQuality = computed(() => ['jpg', 'webp', 'avif'].includes(result.value?.format) || (result.value?.format === 'png' && settings.image.pngPalette));

const box = reactive({ w: 0, h: 0 });
let ro = null;
watch(stage, (el) => {
  ro?.disconnect();
  if (!el) return;
  ro = new ResizeObserver(() => {
    box.w = el.clientWidth - 48;
    box.h = el.clientHeight - 48;
  });
  ro.observe(el);
});
onBeforeUnmount(() => ro?.disconnect());

const scale = computed(() => {
  if (!result.value) return 1;
  if (zoom.value === 'actual') return 1;
  return Math.max(0.01, Math.min(box.w / result.value.width, box.h / result.value.height, 8));
});

const canvasStyle = computed(() => {
  if (!result.value) return {};
  const k = scale.value;
  return {
    width: `${Math.round(result.value.width * k)}px`,
    height: `${Math.round(result.value.height * k)}px`,
    imageRendering: k >= 2 ? 'pixelated' : 'auto'
  };
});

let seq = 0;
let timer = null;

async function run() {
  const it = item.value;
  if (!it) return;
  const my = ++seq;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.estimate({ item: { id: it.id, path: it.path, edit: it.edit }, settings });
    if (my === seq) result.value = res;
  } catch (e) {
    if (my === seq) {
      error.value = errorText(e);
      result.value = null;
    }
  } finally {
    if (my === seq) loading.value = false;
  }
}

function schedule(delay = 250) {
  clearTimeout(timer);
  timer = setTimeout(run, delay);
}

watch(
  () => ui.previewId,
  (id) => {
    if (!id) return;
    result.value = null;
    split.value = 0.5;
    const it = getItem(id);
    if (it) loadDetails(it);
    schedule(0);
  },
  { immediate: true }
);

// Пересчитываем при любом изменении настроек изображений.
watch(
  () => JSON.stringify(settings.image),
  () => {
    if (item.value) schedule();
  }
);

function onDown(e) {
  if (!result.value || e.button !== 0) return;
  const canvas = stage.value.querySelector('.pv-canvas');
  if (!canvas) return;
  const move = (ev) => {
    const r = canvas.getBoundingClientRect();
    split.value = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  };
  move(e);
  stage.value.setPointerCapture(e.pointerId);
  stage.value.addEventListener('pointermove', move);
  stage.value.addEventListener('pointerup', () => stage.value.removeEventListener('pointermove', move), { once: true });
}

function toSettings() {
  ui.tab = 'image';
  close();
}

function close() {
  ui.previewId = null;
  clearTimeout(timer);
  seq++;
}
</script>

<style scoped>
.pv-head {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.pv-head__nav {
  display: flex;
  gap: 2px;
}

.pv-head__name {
  flex: 0 1 auto;
  min-width: 60px;
  font-size: 13.5px;
  font-weight: 600;
}

.pv-stats {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  padding-right: 8px;
}

.pv-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  white-space: nowrap;
}

.pv-stat__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.02em;
}

.pv-stat__main {
  font-weight: 600;
}

.faint {
  color: var(--text-3);
}

.pv-delta {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.pv-delta.is-good {
  background: var(--ok-soft);
  color: var(--ok);
}

.pv-delta.is-bad {
  background: var(--warn-soft);
  color: var(--warn);
}

.pv {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

.pv-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
  cursor: ew-resize;
  touch-action: none;
}

.pv-stage.is-actual {
  overflow: auto;
  place-items: start center;
}

.pv-msg {
  color: var(--text-3);
  cursor: default;
}

.pv-msg--err {
  color: var(--err);
  max-width: 480px;
  text-align: center;
}

.pv-canvas {
  position: relative;
  flex: none;
  box-shadow: 0 0 0 1px var(--line-2), 0 20px 50px rgba(0, 0, 0, 0.35);
}

.pv-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
  image-rendering: inherit;
}

.pv-split {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1.5px solid #fff;
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.pv-split__knob {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  padding: 5px 3px;
  border-radius: 20px;
  background: #fff;
  color: #222;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}

.pv-tag {
  position: absolute;
  top: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(10, 10, 12, 0.7);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  pointer-events: none;
}

.pv-tag--l {
  left: 10px;
}

.pv-tag--r {
  right: 10px;
}

.pv-busy {
  position: absolute;
  right: 16px;
  bottom: 12px;
  padding: 3px 9px;
  border-radius: 20px;
  background: var(--panel-raised);
  box-shadow: var(--shadow-pop);
  font-size: 11.5px;
  color: var(--text-2);
}

.pv-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.pv-bar__zoom {
  width: 150px;
}

.pv-bar__label {
  font-size: 12px;
  color: var(--text-2);
}

.pv-bar__slider {
  width: 260px;
}

.pv-bar__note {
  font-size: 11.5px;
}

.pv-bar__settings {
  margin-left: auto;
}
</style>
