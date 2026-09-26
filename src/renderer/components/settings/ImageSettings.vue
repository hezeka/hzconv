<template>
  <UiSection title="Формат">
    <FormatGrid v-model="s.format" :formats="formatList" />
    <p v-if="formatNote" class="note">{{ formatNote }}</p>
  </UiSection>

  <UiSection v-if="s.format === 'ico'" title="Размеры иконки">
    <div class="chips">
      <button v-for="size in icoSizes" :key="size" type="button" class="chip mono" :class="{ 'is-on': s.icoSizes.includes(size) }" @click="toggleIco(size)">
        {{ size }}
      </button>
    </div>
    <p class="note">Все размеры упаковываются в один .ico. Для favicon обычно хватает 16, 32 и 48.</p>
  </UiSection>

  <UiSection v-else title="Качество" :summary="qualitySummary">
    <UiSlider v-if="showQuality" v-model="s.quality" :min="1" :max="100" :disabled="lossless" />
    <UiSwitch v-if="canLossless" v-model="s.lossless" hint="Точная копия пикселей, файл крупнее">Без потерь</UiSwitch>
    <UiSwitch v-if="s.format === 'png' || s.format === 'original'" v-model="s.pngPalette" hint="Как TinyPNG: до 256 цветов, файл в 2–4 раза легче">Палитра для PNG</UiSwitch>
    <UiField v-if="s.pngPalette || s.format === 'gif'" label="Цветов">
      <UiSlider v-model="s.colors" :min="2" :max="256" />
    </UiField>
    <p v-if="s.format === 'tiff'" class="note">TIFF сохраняется без потерь (LZW).</p>
    <UiSwitch v-if="!isVideo" :model-value="s.metadata === 'keep'" hint="Дата съёмки, камера и геометка" @update:model-value="s.metadata = $event ? 'keep' : 'strip'">
      Сохранять EXIF
    </UiSwitch>
  </UiSection>

  <UiSection title="Размер и кадр" :summary="sizeSummary">
    <UiField label="Размер">
      <UiSelect v-model="s.resize.mode" :options="resizeModes" />
    </UiField>

    <UiField v-if="s.resize.mode === 'percent'" label="Масштаб">
      <UiSlider v-model="s.resize.percent" :min="1" :max="400" suffix="%" />
    </UiField>

    <UiField v-else-if="s.resize.mode === 'width'" label="Ширина">
      <UiNumber v-model="s.resize.width" :min="1" :max="30000" suffix="px" />
    </UiField>

    <UiField v-else-if="s.resize.mode === 'height'" label="Высота">
      <UiNumber v-model="s.resize.height" :min="1" :max="30000" suffix="px" />
    </UiField>

    <UiField v-else-if="s.resize.mode === 'longest'" label="Длинная сторона">
      <UiNumber v-model="s.resize.width" :min="1" :max="30000" suffix="px" />
    </UiField>

    <template v-else-if="isBox">
      <UiField label="Рамка">
        <div class="pair">
          <UiNumber v-model="s.resize.width" :min="1" :max="30000" prefix="Ш" />
          <button class="pair__swap" type="button" title="Поменять местами" @click="swapBox"><Icon name="refresh" :size="13" /></button>
          <UiNumber v-model="s.resize.height" :min="1" :max="30000" prefix="В" />
        </div>
      </UiField>
      <div class="chips chips--sizes">
        <button v-for="p in boxPresets" :key="p.label" type="button" class="chip" @click="setBox(p)">{{ p.label }}</button>
      </div>
      <UiField label="Вписывание" stack>
        <UiSegmented v-model="s.resize.fit" :options="fitOptions" />
      </UiField>
      <p class="note">{{ fitNote }}</p>
    </template>

    <UiField v-if="!isBox" label="Пропорции">
      <UiSelect v-model="s.crop.aspect" :options="aspects" />
    </UiField>
    <UiField v-if="!isBox && s.crop.aspect === 'custom'" label="Соотношение">
      <div class="pair">
        <UiNumber v-model="s.crop.customW" :min="0.01" :max="1000" :step="0.01" />
        <span class="pair__colon">:</span>
        <UiNumber v-model="s.crop.customH" :min="0.01" :max="1000" :step="0.01" />
      </div>
    </UiField>
    <UiField v-if="cropsFrame" label="Что оставить">
      <UiSelect v-model="position" :options="POSITIONS" />
    </UiField>

    <UiSwitch v-if="canEnlarge" v-model="s.resize.enlarge" hint="Мелкие картинки будут растянуты">Увеличивать маленькие</UiSwitch>
    <UiSwitch v-model="s.trim" hint="Однотонные или прозрачные края">Обрезать пустые поля</UiSwitch>
    <p v-if="ui.mode === 'files'" class="note">Точный кадр для отдельного файла — клавиша C или двойной щелчок по файлу.</p>
  </UiSection>

  <OutputSettings />

  <UiSection title="Несколько размеров" collapsible store-key="img-variants" :open="false" :summary="variantsSummary">
    <UiSwitch v-model="s.variants.enabled" hint="Каждый файл сохранится в нескольких размерах с суффиксами">Сохранять варианты</UiSwitch>
    <template v-if="s.variants.enabled">
      <div class="chips">
        <button v-for="p in variantPresets" :key="p.label" type="button" class="chip" @click="s.variants.items = clone(p.items)">{{ p.label }}</button>
      </div>
      <div class="variants">
        <div v-for="(v, i) in s.variants.items" :key="i" class="variant">
          <UiSegmented v-model="v.kind" small :options="[{ value: 'x', label: '×' }, { value: 'w', label: 'px' }]" class="variant__kind" />
          <UiNumber v-model="v.value" :min="v.kind === 'x' ? 0.05 : 1" :max="v.kind === 'x' ? 16 : 30000" :step="v.kind === 'x' ? 0.05 : 1" />
          <UiInput v-model="v.suffix" mono placeholder="суффикс" />
          <UiButton variant="ghost" size="s" icon="close" title="Удалить" @click="s.variants.items.splice(i, 1)" />
        </div>
      </div>
      <UiButton size="s" icon="plus" @click="addVariant">Добавить размер</UiButton>
      <p class="note">«×» — множитель от результата блока «Размер и кадр», «px» — точная ширина.</p>
    </template>
  </UiSection>

  <UiSection title="Дополнительно" collapsible store-key="img-extra" :open="false" :summary="extraSummary">
    <UiField v-if="hasEffort" label="Сжатие" hint="Медленнее — меньше файл">
      <UiSegmented v-model="s.effort" :options="effortOptions" />
    </UiField>
    <UiField label="Фон" hint="Для прозрачности в JPG и полей">
      <UiColor v-model="s.background" />
    </UiField>
    <UiSwitch v-model="s.autoOrient" hint="Фото с телефона не окажутся на боку">Поворот по EXIF</UiSwitch>
    <UiSwitch v-model="s.keepAnimation" hint="Для GIF и WebP с несколькими кадрами">Сохранять анимацию</UiSwitch>
    <UiSwitch v-if="s.format === 'jpg' || s.format === 'original'" v-model="s.progressive" hint="Изображение проявляется при загрузке">Прогрессивный JPG</UiSwitch>
    <UiSwitch v-model="s.pixelArt" hint="Без сглаживания при масштабе — для пиксель-арта и скриншотов">Чёткие пиксели</UiSwitch>
    <UiSwitch v-model="s.sharpen" hint="Возвращает чёткость после уменьшения">Лёгкая резкость</UiSwitch>
    <UiSwitch v-model="s.grayscale">Оттенки серого</UiSwitch>
  </UiSection>

  <div class="islands-reset">
    <UiButton variant="ghost" size="s" icon="reset" @click="resetSection('image')">Сбросить настройки фото</UiButton>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { settings, resetSection } from '../../store/settings';
import { ui } from '../../store/ui';
import { outputFormats, ASPECTS, POSITIONS } from '../../utils/targets';
import Icon from '../ui/Icon.vue';
import UiSection from '../ui/UiSection.vue';
import UiField from '../ui/UiField.vue';
import UiSlider from '../ui/UiSlider.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiSegmented from '../ui/UiSegmented.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiNumber from '../ui/UiNumber.vue';
import UiInput from '../ui/UiInput.vue';
import UiButton from '../ui/UiButton.vue';
import UiColor from '../ui/UiColor.vue';
import FormatGrid from '../ui/FormatGrid.vue';
import OutputSettings from './OutputSettings.vue';

const s = settings.image;
const clone = (v) => JSON.parse(JSON.stringify(v));

const NOTES = {
  original: 'не меняется',
  jpg: 'фото',
  png: 'без потерь',
  webp: 'для веба',
  avif: 'легче всех',
  tiff: 'печать',
  gif: 'анимация',
  ico: 'favicon',
  mp4: 'из GIF',
  webm: 'из GIF'
};

const formatList = computed(() => outputFormats('image').map((f) => ({ id: f.id, label: f.label, note: NOTES[f.id], hint: f.fromGifOnly ? 'Только для GIF-анимаций: видео весит в разы меньше' : '' })));

const isVideo = computed(() => s.format === 'mp4' || s.format === 'webm');
const hasQuality = computed(() => ['jpg', 'webp', 'avif', 'original', 'mp4', 'webm'].includes(s.format));
// Один ползунок на всё: у PNG с палитрой он задаёт качество палитры.
const showQuality = computed(() => hasQuality.value || (s.format === 'png' && s.pngPalette));
const hasEffort = computed(() => ['jpg', 'png', 'webp', 'avif', 'original'].includes(s.format));
const canLossless = computed(() => s.format === 'webp' || s.format === 'avif');
const lossless = computed(() => canLossless.value && s.lossless);

const formatNote = computed(() => {
  if (s.format === 'original') return 'Каждый файл сохранится в своём формате — удобно, чтобы только уменьшить или пережать.';
  if (s.format === 'avif') return 'AVIF даёт самый маленький размер, но кодируется заметно дольше.';
  if (isVideo.value) return 'GIF-анимации станут видео без звука — в 5–10 раз легче.';
  if (s.format === 'jpg') return 'JPG не поддерживает прозрачность — она заменится цветом фона.';
  return '';
});

const qualityHint = computed(() => {
  const q = s.quality;
  if (lossless.value) return 'не используется';
  if (q >= 90) return 'почти без потерь';
  if (q >= 75) return 'оптимально';
  if (q >= 55) return 'заметно легче';
  return 'видны артефакты';
});

const effortOptions = [
  { value: 'fast', label: 'Быстро' },
  { value: 'balanced', label: 'Баланс' },
  { value: 'max', label: 'Макс.' }
];

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
function toggleIco(size) {
  const set = new Set(s.icoSizes);
  set.has(size) ? set.delete(size) : set.add(size);
  if (set.size) s.icoSizes = [...set].sort((a, b) => a - b);
}

const resizeModes = [
  { value: 'none', label: 'Без изменений' },
  { value: 'percent', label: 'В процентах' },
  { value: 'width', label: 'По ширине' },
  { value: 'height', label: 'По высоте' },
  { value: 'longest', label: 'По длинной стороне' },
  { value: 'box', label: 'В рамку Ш × В', hint: 'Вписать, заполнить с обрезкой или добавить поля' }
];

const fitOptions = [
  { value: 'inside', label: 'Вписать' },
  { value: 'cover', label: 'Заполнить' },
  { value: 'contain', label: 'С полями' },
  { value: 'fill', label: 'Растянуть' }
];

const fitNote = computed(
  () =>
    ({
      inside: 'Картинка целиком помещается в рамку, пропорции сохраняются.',
      cover: 'Рамка заполняется полностью, лишнее обрезается.',
      contain: 'Точно Ш × В: картинка целиком, свободное место — цвет фона.',
      fill: 'Точно Ш × В, пропорции не сохраняются.'
    })[s.resize.fit]
);

const boxPresets = [
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1080 × 1080', w: 1080, h: 1080 },
  { label: '1080 × 1350', w: 1080, h: 1350 },
  { label: '1080 × 1920', w: 1080, h: 1920 },
  { label: '1200 × 630', w: 1200, h: 630 }
];
function setBox(p) {
  s.resize.width = p.w;
  s.resize.height = p.h;
}
function swapBox() {
  [s.resize.width, s.resize.height] = [s.resize.height, s.resize.width];
}

const ASPECT_HINTS = { '1:1': 'квадрат', '4:5': 'лента соцсетей', '9:16': 'сторис и шортсы', '16:9': 'видео, обложки', '3:2': 'фотокамера' };
const aspects = [
  { value: 'none', label: 'Как есть' },
  ...ASPECTS.filter((a) => a.value !== 'none').map((a) => ({ ...a, hint: ASPECT_HINTS[a.value] })),
  { value: 'custom', label: 'Своё соотношение' }
];
const isBox = computed(() => s.resize.mode === 'box');
const canEnlarge = computed(() => !['none', 'percent'].includes(s.resize.mode));
// Рамка сама задаёт пропорции — отдельная обрезка по пропорциям с ней не нужна.
watch(isBox, (box) => {
  if (box) s.crop.aspect = 'none';
});
const cropsFrame = computed(() => (isBox.value ? s.resize.fit === 'cover' : s.crop.aspect !== 'none'));
const position = computed({
  get: () => (isBox.value ? s.resize.position : s.crop.position),
  set: (v) => {
    if (isBox.value) s.resize.position = v;
    else s.crop.position = v;
  }
});

const sizeSummary = computed(() => {
  const r = s.resize;
  const parts = [];
  if (r.mode === 'percent') parts.push(`${r.percent}%`);
  else if (r.mode === 'width') parts.push(`ширина ${r.width}`);
  else if (r.mode === 'height') parts.push(`высота ${r.height}`);
  else if (r.mode === 'longest') parts.push(`до ${r.width} px`);
  else if (r.mode === 'box') parts.push(`${r.width} × ${r.height}`);
  if (!isBox.value && s.crop.aspect !== 'none') parts.push(s.crop.aspect === 'custom' ? `${s.crop.customW}:${s.crop.customH}` : s.crop.aspect);
  if (s.trim) parts.push('без полей');
  return parts.join(' · ') || 'как есть';
});

const qualitySummary = computed(() => {
  if (lossless.value) return 'без потерь';
  if (showQuality.value) return qualityHint.value;
  if (s.format === 'png') return 'без потерь';
  return '';
});

const extraSummary = computed(() => {
  const parts = [];
  if (hasEffort.value && s.effort !== 'balanced') parts.push(s.effort === 'fast' ? 'быстро' : 'макс. сжатие');
  if (s.sharpen) parts.push('резкость');
  if (s.pixelArt) parts.push('чёткие пиксели');
  if (s.grayscale) parts.push('ч/б');
  if (!s.autoOrient) parts.push('без поворота');
  return parts.join(' · ');
});

const variantPresets = [
  {
    label: '@1x @2x @3x',
    items: [
      { kind: 'x', value: 1, suffix: '@1x' },
      { kind: 'x', value: 2, suffix: '@2x' },
      { kind: 'x', value: 3, suffix: '@3x' }
    ]
  },
  {
    label: 'srcset 480–1920',
    items: [480, 960, 1440, 1920].map((w) => ({ kind: 'w', value: w, suffix: `-${w}w` }))
  },
  {
    label: 'Android dpi',
    items: [
      { kind: 'x', value: 1, suffix: '-mdpi' },
      { kind: 'x', value: 1.5, suffix: '-hdpi' },
      { kind: 'x', value: 2, suffix: '-xhdpi' },
      { kind: 'x', value: 3, suffix: '-xxhdpi' },
      { kind: 'x', value: 4, suffix: '-xxxhdpi' }
    ]
  }
];

const variantsSummary = computed(() => (s.variants.enabled ? s.variants.items.map((v) => v.suffix || (v.kind === 'x' ? `${v.value}×` : `${v.value}px`)).join(' ') : 'выкл.'));

function addVariant() {
  const last = s.variants.items[s.variants.items.length - 1];
  if (last?.kind === 'w') s.variants.items.push({ kind: 'w', value: Math.round(last.value * 1.5), suffix: `-${Math.round(last.value * 1.5)}w` });
  else s.variants.items.push({ kind: 'x', value: (last?.value || 0) + 1, suffix: `@${(last?.value || 0) + 1}x` });
}
</script>
