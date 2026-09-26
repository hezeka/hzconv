<template>
  <UiModal :open="Boolean(item)" size="full" flush :dismissable="false" @close="close">
    <template #header>
      <div class="ce-head">
        <div class="ce-head__nav">
          <UiButton variant="ghost" size="s" icon="chevron-left" title="Предыдущий файл" :disabled="!prevItem" @click="go(prevItem)" />
          <UiButton variant="ghost" size="s" icon="chevron-right" title="Следующий файл" :disabled="!nextItem" @click="go(nextItem)" />
        </div>
        <div class="ce-head__titles">
          <div class="ce-head__title ellipsis">{{ item?.name }}</div>
          <div class="ce-head__sub num">{{ position }}</div>
        </div>
      </div>
    </template>

    <div class="ce">
      <div
        ref="stage"
        class="ce-stage"
        tabindex="0"
        @keydown="onKey"
        @pointerdown="onStageDown"
      >
        <div v-if="error" class="ce-stage__msg ce-stage__msg--err">{{ error }}</div>
        <div v-else-if="!src" class="ce-stage__msg">Загрузка превью…</div>

        <template v-if="src">
          <div class="ce-img checker" :style="viewStyle">
            <img :src="src" alt="" draggable="false" :class="{ 'is-loading': loading }" />
          </div>
          <div class="ce-box" :class="{ 'is-dragging': dragging }" :style="boxStyle" @pointerdown.stop="onDown($event, 'move')">
            <div class="ce-box__grid" />
            <span v-for="h in handles" :key="h" class="ce-h" :class="`ce-h--${h}`" @pointerdown.stop="onDown($event, h)" />
            <div class="ce-box__size num">{{ px.w }} × {{ px.h }}</div>
          </div>
        </template>
      </div>

      <aside class="ce-side">
        <UiSection title="Пропорции">
          <div class="chips">
            <button v-for="a in aspects" :key="a.value" type="button" class="chip" :class="{ 'is-on': aspect === a.value }" @click="setAspect(a.value)">
              {{ a.label }}
            </button>
          </div>
          <UiButton v-if="ratio && aspect !== 'original'" size="s" icon="refresh" @click="flipAspect">Повернуть рамку</UiButton>
        </UiSection>

        <UiSection title="Область, px">
          <div class="ce-grid">
            <UiNumber :model-value="px.x" prefix="X" :min="0" :max="full.width" @update:model-value="setPx('x', $event)" />
            <UiNumber :model-value="px.y" prefix="Y" :min="0" :max="full.height" @update:model-value="setPx('y', $event)" />
            <UiNumber :model-value="px.w" prefix="Ш" :min="1" :max="full.width" @update:model-value="setPx('w', $event)" />
            <UiNumber :model-value="px.h" prefix="В" :min="1" :max="full.height" @update:model-value="setPx('h', $event)" />
          </div>
          <p class="note num">Исходник: {{ full.width }} × {{ full.height }}</p>
        </UiSection>

        <UiSection title="Поворот и отражение">
          <div class="ce-tools">
            <UiButton icon="rotate-left" title="Повернуть влево" @click="rotate(-90)" />
            <UiButton icon="rotate-right" title="Повернуть вправо" @click="rotate(90)" />
            <UiButton icon="flip-h" title="Отразить по горизонтали" @click="flip('h')" />
            <UiButton icon="flip-v" title="Отразить по вертикали" @click="flip('v')" />
          </div>
        </UiSection>

        <UiSection v-if="item?.type === 'video' && duration > 0" title="Кадр для просмотра">
          <UiSlider v-model="time" :min="0" :max="Math.max(0.1, Math.floor(duration * 10) / 10)" :step="0.1" :show-input="false" />
          <p class="note num">{{ formatDuration(time) || '0:00' }} из {{ formatDuration(duration) }}</p>
        </UiSection>

        <div class="ce-side__spacer" />

        <div class="ce-side__foot">
          <UiSwitch v-model="applyAll" :hint="applyAllHint">Применить ко всем</UiSwitch>
          <div class="ce-side__buttons">
            <UiButton variant="ghost" icon="reset" @click="resetAll">Сбросить</UiButton>
            <UiButton variant="primary" @click="save">Готово</UiButton>
          </div>
        </div>
      </aside>
    </div>
  </UiModal>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { api, errorText } from '../api';
import { ui } from '../store/ui';
import { settings } from '../store/settings';
import { queue, getItem, setEdit, loadDetails } from '../store/queue';
import { toast } from '../store/toast';
import { formatDuration } from '../utils/format';
import UiModal from './ui/UiModal.vue';
import UiButton from './ui/UiButton.vue';
import UiSection from './ui/UiSection.vue';
import UiNumber from './ui/UiNumber.vue';
import UiSlider from './ui/UiSlider.vue';
import UiSwitch from './ui/UiSwitch.vue';

const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const aspects = [
  { value: 'free', label: 'Свободно' },
  { value: 'original', label: 'Исходные' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '3:4', label: '3:4' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' }
];

const item = computed(() => (ui.cropId ? getItem(ui.cropId) : null));
const editable = computed(() => queue.items.filter((it) => it.type !== 'audio'));
const idx = computed(() => editable.value.findIndex((it) => it.id === ui.cropId));
const prevItem = computed(() => editable.value[idx.value - 1] || null);
const nextItem = computed(() => editable.value[idx.value + 1] || null);
const position = computed(() => (editable.value.length > 1 ? `${idx.value + 1} из ${editable.value.length}` : item.value?.type === 'video' ? 'Видео' : 'Изображение'));

const stage = ref(null);
const src = ref('');
const loading = ref(false);
const error = ref('');
const full = reactive({ width: 1, height: 1 });
const edit = reactive({ rotate: 0, flipH: false, flipV: false });
const crop = reactive({ x: 0, y: 0, w: 1, h: 1 });
const aspect = ref('free');
const applyAll = ref(false);
const time = ref(0);
const view = reactive({ left: 0, top: 0, width: 0, height: 0 });
const dragging = ref(false);

const duration = computed(() => item.value?.details?.duration || 0);
const sameType = computed(() => queue.items.filter((it) => it.type === item.value?.type));
const applyAllHint = computed(() => `${sameType.value.length} ${item.value?.type === 'video' ? 'видео' : 'изобр.'} в очереди: та же область в долях и поворот`);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ——— Соотношение сторон ———
const ratio = computed(() => {
  if (aspect.value === 'free') return null;
  if (aspect.value === 'original') return full.width / full.height;
  const [a, b] = aspect.value.split(':').map(Number);
  return a / b;
});
// В долях: w_n / h_n = ratio * H / W
const nRatio = computed(() => (ratio.value ? (ratio.value * full.height) / full.width : null));

const px = computed(() => ({
  x: Math.round(crop.x * full.width),
  y: Math.round(crop.y * full.height),
  w: Math.max(1, Math.round(crop.w * full.width)),
  h: Math.max(1, Math.round(crop.h * full.height))
}));

// ——— Геометрия отображения ———
function layout() {
  const el = stage.value;
  if (!el) return;
  const pad = 36;
  const W = el.clientWidth - pad * 2;
  const H = el.clientHeight - pad * 2;
  const k = Math.min(W / full.width, H / full.height);
  view.width = full.width * k;
  view.height = full.height * k;
  view.left = (el.clientWidth - view.width) / 2;
  view.top = (el.clientHeight - view.height) / 2;
}

let ro = null;
watch(stage, (el) => {
  ro?.disconnect();
  if (!el) return;
  ro = new ResizeObserver(layout);
  ro.observe(el);
});
onBeforeUnmount(() => ro?.disconnect());

const viewStyle = computed(() => ({ left: `${view.left}px`, top: `${view.top}px`, width: `${view.width}px`, height: `${view.height}px` }));
const boxStyle = computed(() => ({
  left: `${view.left + crop.x * view.width}px`,
  top: `${view.top + crop.y * view.height}px`,
  width: `${crop.w * view.width}px`,
  height: `${crop.h * view.height}px`
}));

// ——— Загрузка превью ———
let loadSeq = 0;
async function loadPreview() {
  const it = item.value;
  if (!it) return;
  const my = ++loadSeq;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.preview({
      path: it.path,
      edit: { rotate: edit.rotate, flipH: edit.flipH, flipV: edit.flipV },
      maxSize: 1800,
      time: it.type === 'video' ? time.value : null,
      autoOrient: settings.image.autoOrient
    });
    if (my !== loadSeq) return;
    src.value = res.dataUrl;
    full.width = res.width;
    full.height = res.height;
    await nextTick();
    layout();
  } catch (e) {
    if (my === loadSeq) error.value = `Не удалось открыть файл: ${errorText(e)}`;
  } finally {
    if (my === loadSeq) loading.value = false;
  }
}

watch(
  () => ui.cropId,
  async (id) => {
    if (!id) return;
    const it = getItem(id);
    if (!it) return;
    loadDetails(it);
    const e = it.edit || {};
    Object.assign(edit, { rotate: e.rotate || 0, flipH: Boolean(e.flipH), flipV: Boolean(e.flipV) });
    Object.assign(crop, e.crop || { x: 0, y: 0, w: 1, h: 1 });
    aspect.value = 'free';
    time.value = 0;
    src.value = '';
    await loadPreview();
    stage.value?.focus();
  },
  { immediate: true }
);

let timeTimer = null;
watch(time, () => {
  clearTimeout(timeTimer);
  timeTimer = setTimeout(loadPreview, 180);
});

// ——— Перетаскивание ———
let start = null;
const MIN = 8; // px экрана

function toNorm(e) {
  const r = stage.value.getBoundingClientRect();
  return {
    x: clamp((e.clientX - r.left - view.left) / view.width, 0, 1),
    y: clamp((e.clientY - r.top - view.top) / view.height, 0, 1)
  };
}

function fromAnchor(ax, ay, pxn, pyn, r) {
  const minW = MIN / view.width;
  const minH = MIN / view.height;
  const dirX = pxn >= ax ? 1 : -1;
  const dirY = pyn >= ay ? 1 : -1;
  const maxW = dirX > 0 ? 1 - ax : ax;
  const maxH = dirY > 0 ? 1 - ay : ay;
  let w = Math.abs(pxn - ax);
  let h = Math.abs(pyn - ay);
  if (r) {
    if (w / Math.max(h, 1e-9) > r) h = w / r;
    else w = h * r;
    if (w > maxW) {
      w = maxW;
      h = w / r;
    }
    if (h > maxH) {
      h = maxH;
      w = h * r;
    }
  } else {
    w = Math.min(w, maxW);
    h = Math.min(h, maxH);
  }
  w = Math.max(w, Math.min(minW, maxW));
  h = Math.max(h, Math.min(minH, maxH));
  return { x: dirX > 0 ? ax : ax - w, y: dirY > 0 ? ay : ay - h, w, h };
}

function onDown(e, mode) {
  if (e.button !== 0) return;
  e.preventDefault();
  stage.value.setPointerCapture(e.pointerId);
  start = { mode, p: toNorm(e), crop: { ...crop } };
  dragging.value = true;
  stage.value.addEventListener('pointermove', onMove);
  stage.value.addEventListener('pointerup', onUp, { once: true });
  stage.value.focus();
}

function onStageDown(e) {
  if (!src.value || e.button !== 0) return;
  const p = toNorm(e);
  onDown(e, 'new');
  start.anchor = p;
}

function onMove(e) {
  if (!start) return;
  const p = toNorm(e);
  const s = start.crop;
  const r = nRatio.value;
  const m = start.mode;

  if (m === 'move') {
    crop.x = clamp(s.x + (p.x - start.p.x), 0, 1 - s.w);
    crop.y = clamp(s.y + (p.y - start.p.y), 0, 1 - s.h);
    return;
  }
  if (m === 'new') {
    Object.assign(crop, fromAnchor(start.anchor.x, start.anchor.y, p.x, p.y, r));
    return;
  }
  if (m.length === 2) {
    // Угол: противоположный угол неподвижен.
    const ax = m.includes('w') ? s.x + s.w : s.x;
    const ay = m.includes('n') ? s.y + s.h : s.y;
    Object.assign(crop, fromAnchor(ax, ay, p.x, p.y, r));
    return;
  }
  // Сторона
  const minW = MIN / view.width;
  const minH = MIN / view.height;
  if (m === 'e' || m === 'w') {
    const ax = m === 'w' ? s.x + s.w : s.x;
    let w = clamp(m === 'e' ? p.x - ax : ax - p.x, minW, m === 'e' ? 1 - ax : ax);
    if (r) {
      const cy = s.y + s.h / 2;
      let h = w / r;
      const maxH = 2 * Math.min(cy, 1 - cy);
      if (h > maxH) {
        h = maxH;
        w = h * r;
      }
      crop.y = cy - h / 2;
      crop.h = h;
    }
    crop.w = w;
    crop.x = m === 'e' ? ax : ax - w;
  } else {
    const ay = m === 'n' ? s.y + s.h : s.y;
    let h = clamp(m === 's' ? p.y - ay : ay - p.y, minH, m === 's' ? 1 - ay : ay);
    if (r) {
      const cx = s.x + s.w / 2;
      let w = h * r;
      const maxW = 2 * Math.min(cx, 1 - cx);
      if (w > maxW) {
        w = maxW;
        h = w / r;
      }
      crop.x = cx - w / 2;
      crop.w = w;
    }
    crop.h = h;
    crop.y = m === 's' ? ay : ay - h;
  }
}

function onUp() {
  stage.value?.removeEventListener('pointermove', onMove);
  dragging.value = false;
  // Щелчок без движения по пустому месту не должен схлопывать рамку.
  if (start?.mode === 'new' && crop.w * view.width <= MIN + 0.5 && crop.h * view.height <= MIN + 0.5) Object.assign(crop, start.crop);
  start = null;
}

// ——— Пропорции ———
function fitAspect() {
  const r = nRatio.value;
  if (!r) return;
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  let w = 1;
  let h = w / r;
  if (h > 1) {
    h = 1;
    w = r;
  }
  crop.w = w;
  crop.h = h;
  crop.x = clamp(cx - w / 2, 0, 1 - w);
  crop.y = clamp(cy - h / 2, 0, 1 - h);
}

function setAspect(v) {
  aspect.value = v;
  fitAspect();
}

function flipAspect() {
  if (!aspect.value.includes(':')) return;
  const [a, b] = aspect.value.split(':');
  const inv = `${b}:${a}`;
  aspect.value = inv;
  fitAspect();
}

// ——— Точные значения ———
function setPx(key, value) {
  const W = full.width;
  const H = full.height;
  const r = ratio.value;
  if (key === 'x') crop.x = clamp(value / W, 0, 1 - crop.w);
  if (key === 'y') crop.y = clamp(value / H, 0, 1 - crop.h);
  if (key === 'w') {
    crop.w = clamp(value / W, 1 / W, 1 - crop.x);
    if (r) crop.h = clamp((crop.w * W) / r / H, 1 / H, 1 - crop.y);
  }
  if (key === 'h') {
    crop.h = clamp(value / H, 1 / H, 1 - crop.y);
    if (r) crop.w = clamp((crop.h * H * r) / W, 1 / W, 1 - crop.x);
  }
}

// ——— Поворот и отражение (в той же семантике, что и при конвертации) ———
function rotate(delta) {
  edit.rotate = (edit.rotate + delta + 360) % 360;
  const { x, y, w, h } = crop;
  if (delta > 0) Object.assign(crop, { x: 1 - y - h, y: x, w: h, h: w });
  else Object.assign(crop, { x: y, y: 1 - x - w, w: h, h: w });
  if (aspect.value.includes(':')) {
    const [a, b] = aspect.value.split(':');
    aspect.value = aspects.some((o) => o.value === `${b}:${a}`) ? `${b}:${a}` : 'free';
  }
  [full.width, full.height] = [full.height, full.width];
  layout();
  loadPreview();
}

function flip(axis) {
  const quarter = edit.rotate % 180 !== 0;
  // sharp отражает до поворота: при повороте на 90° визуальные оси меняются местами.
  if ((axis === 'h') !== quarter) edit.flipH = !edit.flipH;
  else edit.flipV = !edit.flipV;
  if (axis === 'h') crop.x = 1 - crop.x - crop.w;
  else crop.y = 1 - crop.y - crop.h;
  loadPreview();
}

function resetAll() {
  const rotated = edit.rotate || edit.flipH || edit.flipV;
  Object.assign(edit, { rotate: 0, flipH: false, flipV: false });
  Object.assign(crop, { x: 0, y: 0, w: 1, h: 1 });
  aspect.value = 'free';
  if (rotated) loadPreview();
}

function onKey(e) {
  const step = e.shiftKey ? 10 : 1;
  const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (map[e.key]) {
    e.preventDefault();
    const [dx, dy] = map[e.key];
    crop.x = clamp(crop.x + dx / full.width, 0, 1 - crop.w);
    crop.y = clamp(crop.y + dy / full.height, 0, 1 - crop.h);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    save();
  }
}

// ——— Сохранение ———
function currentEdit() {
  const isFull = crop.x < 1e-4 && crop.y < 1e-4 && crop.w > 0.9999 && crop.h > 0.9999;
  return {
    rotate: edit.rotate,
    flipH: edit.flipH,
    flipV: edit.flipV,
    crop: isFull ? null : { x: crop.x, y: crop.y, w: crop.w, h: crop.h }
  };
}

function commit() {
  const e = currentEdit();
  if (applyAll.value) {
    sameType.value.forEach((it) => setEdit(it.id, e));
    toast(`Кадр применён к ${sameType.value.length} файлам`, { kind: 'ok' });
  } else if (item.value) {
    setEdit(item.value.id, e);
  }
}

function save() {
  commit();
  close();
}

function go(target) {
  if (!target) return;
  commit();
  applyAll.value = false;
  ui.cropId = target.id;
}

function close() {
  ui.cropId = null;
  src.value = '';
}
</script>

<style scoped>
.ce-head {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ce-head__nav {
  display: flex;
  gap: 2px;
}

.ce-head__titles {
  min-width: 0;
}

.ce-head__title {
  font-size: 13.5px;
  font-weight: 600;
}

.ce-head__sub {
  font-size: 11.5px;
  color: var(--text-3);
}

.ce {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
}

.ce-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--bg);
  cursor: crosshair;
  touch-action: none;
}

.ce-stage:focus-visible {
  outline: none;
}

.ce-stage__msg {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-3);
}

.ce-stage__msg--err {
  color: var(--err);
  padding: 40px;
  text-align: center;
}

.ce-img {
  position: absolute;
  pointer-events: none;
}

.ce-img img {
  width: 100%;
  height: 100%;
  display: block;
  transition: opacity 160ms var(--ease);
}

.ce-img img.is-loading {
  opacity: 0.6;
}

.ce-box {
  position: absolute;
  box-shadow: 0 0 0 9999px rgba(8, 8, 10, 0.62);
  outline: 1px solid rgba(255, 255, 255, 0.9);
  cursor: move;
}

.ce-box__grid {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 160ms var(--ease);
  background-image: linear-gradient(to right, rgba(255, 255, 255, 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.45) 1px, transparent 1px);
  background-size: 33.333% 33.333%;
  background-position: -1px -1px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.ce-box.is-dragging .ce-box__grid,
.ce-box:hover .ce-box__grid {
  opacity: 1;
}

.ce-box__size {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(10, 10, 12, 0.72);
  color: #fff;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
}

.ce-h {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
}

.ce-h::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.4);
}

.ce-h--n,
.ce-h--s {
  width: 26px;
  margin-left: -13px;
}
.ce-h--e,
.ce-h--w {
  height: 26px;
  margin-top: -13px;
}
.ce-h--n::after,
.ce-h--s::after {
  inset: 5px 3px;
}
.ce-h--e::after,
.ce-h--w::after {
  inset: 3px 5px;
}

.ce-h--nw { left: 0; top: 0; cursor: nwse-resize; }
.ce-h--n { left: 50%; top: 0; cursor: ns-resize; }
.ce-h--ne { left: 100%; top: 0; cursor: nesw-resize; }
.ce-h--e { left: 100%; top: 50%; cursor: ew-resize; }
.ce-h--se { left: 100%; top: 100%; cursor: nwse-resize; }
.ce-h--s { left: 50%; top: 100%; cursor: ns-resize; }
.ce-h--sw { left: 0; top: 100%; cursor: nesw-resize; }
.ce-h--w { left: 0; top: 50%; cursor: ew-resize; }

.ce-side {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
  overflow-y: auto;
}

.ce-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.ce-tools {
  display: flex;
  gap: 6px;
}

.ce-side__spacer {
  flex: 1;
}

.ce-side__foot {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--line);
}

.ce-side__buttons {
  display: flex;
  justify-content: space-between;
}
</style>
