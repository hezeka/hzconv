<template>
  <UiSection title="Формат">
    <FormatGrid v-model="s.format" :formats="videoFormats" />
    <div class="subhead">Только звук</div>
    <FormatGrid v-model="s.format" :formats="audioOnlyFormats" />
  </UiSection>

  <template v-if="isGif">
    <UiSection title="GIF">
      <UiField label="Ширина" hint="0 — как в исходнике">
        <UiNumber v-model="s.gifWidth" :min="0" :max="3840" suffix="px" />
      </UiField>
      <UiField label="Кадров в секунду">
        <UiSlider v-model="s.gifFps" :min="5" :max="30" />
      </UiField>
      <p class="note">Палитра подбирается под каждое видео — цвета остаются чистыми. Для веба лучше MP4 или WebM: они в разы легче.</p>
    </UiSection>
  </template>

  <template v-else-if="isVideoTarget">
    <UiSection title="Кодирование">
      <UiField v-if="hasCodecChoice" label="Кодек">
        <UiSegmented v-model="s.codec" :options="codecOptions" />
      </UiField>
      <UiSwitch :model-value="copy" hint="Меняется только контейнер — мгновенно и без потерь" @update:model-value="setCopy">Без перекодирования</UiSwitch>
      <template v-if="!copy">
        <UiField label="Качество" stack>
          <UiSegmented v-model="s.quality" :options="qualityOptions" />
        </UiField>
        <UiField label="Скорость" hint="Медленнее — меньше файл">
          <UiSegmented v-model="s.speed" :options="speedOptions" />
        </UiField>
      </template>
      <p class="note">{{ qualityNote }}</p>
    </UiSection>

    <UiSection title="Кадр">
      <UiField label="Разрешение">
        <UiSelect v-model="s.resolution" :options="resolutions" :disabled="copy" />
      </UiField>
      <UiField v-if="s.resolution === 'custom'" label="Вписать в">
        <div class="pair">
          <UiNumber v-model="s.customWidth" :min="2" :max="7680" prefix="Ш" />
          <UiNumber v-model="s.customHeight" :min="2" :max="4320" prefix="В" />
        </div>
      </UiField>
      <UiField label="Частота кадров">
        <UiSelect v-model="s.fps" :options="fpsOptions" :disabled="copy" />
      </UiField>
      <UiField label="Пропорции" stack>
        <div class="chips">
          <button v-for="a in ASPECTS" :key="a.value" type="button" class="chip" :class="{ 'is-on': s.cropAspect === a.value }" :disabled="copy" @click="s.cropAspect = a.value">
            {{ a.label }}
          </button>
        </div>
      </UiField>
      <p v-if="copy" class="note note--warn">В режиме «Без перекодирования» кадр менять нельзя — меняется только контейнер.</p>
      <p v-else class="note">Кадр обрезается по центру. Точная область — в редакторе кадра.</p>
    </UiSection>

    <UiSection title="Звук">
      <UiField label="Дорожка">
        <UiSegmented v-model="s.audio" :options="[{ value: 'keep', label: 'Оставить' }, { value: 'remove', label: 'Убрать' }]" />
      </UiField>
      <UiField v-if="s.audio === 'keep' && !copy" label="Битрейт">
        <UiSelect v-model="s.audioBitrate" :options="bitrates" />
      </UiField>
    </UiSection>
  </template>

  <UiSection v-else title="Звук">
    <UiField label="Битрейт">
      <UiSelect v-model="s.audioBitrate" :options="bitrates" :disabled="s.format === 'wav'" />
    </UiField>
    <p class="note">Из видео извлекается первая звуковая дорожка.</p>
  </UiSection>

  <OutputSettings />

  <UiSection title="Фрагмент" collapsible store-key="video-trim" :open="false" :summary="trimSummary">
    <div class="time-pair">
      <UiField label="Начало" stack>
        <UiInput v-model="s.trimStart" mono placeholder="0:00" />
      </UiField>
      <UiField label="Конец" stack>
        <UiInput v-model="s.trimEnd" mono placeholder="до конца" />
      </UiField>
    </div>
    <p class="note" :class="{ 'note--warn': trimError }">{{ trimError || 'Секунды или мм:сс, например 90 или 1:30.5' }}</p>
  </UiSection>

  <div class="islands-reset">
    <UiButton variant="ghost" size="s" icon="reset" @click="resetSection('video')">Сбросить настройки видео</UiButton>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { settings, resetSection } from '../../store/settings';
import { outputFormats, ASPECTS } from '../../utils/targets';
import { parseTime } from '../../utils/time';
import UiSection from '../ui/UiSection.vue';
import UiField from '../ui/UiField.vue';
import UiSlider from '../ui/UiSlider.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiSegmented from '../ui/UiSegmented.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiNumber from '../ui/UiNumber.vue';
import UiInput from '../ui/UiInput.vue';
import UiButton from '../ui/UiButton.vue';
import OutputSettings from './OutputSettings.vue';
import FormatGrid from '../ui/FormatGrid.vue';

const s = settings.video;

const NOTES = { original: 'не меняется', mp4: 'везде', webm: 'для веба', mov: 'Apple', mkv: 'архив', avi: 'старые', gif: 'анимация', mp3: 'везде', m4a: 'AAC', wav: 'без сжатия' };
const all = outputFormats('video').map((f) => ({ id: f.id, label: f.label, note: NOTES[f.id], audioOnly: f.audioOnly }));
const videoFormats = all.filter((f) => !f.audioOnly);
const audioOnlyFormats = all.filter((f) => f.audioOnly);

const isGif = computed(() => s.format === 'gif');
const isVideoTarget = computed(() => !audioOnlyFormats.some((f) => f.id === s.format) && !isGif.value);
const hasCodecChoice = computed(() => ['mp4', 'mov', 'mkv', 'original'].includes(s.format));
const copy = computed(() => s.quality === 'copy');

const codecOptions = [
  { value: 'h264', label: 'H.264', hint: 'Открывается везде' },
  { value: 'h265', label: 'H.265', hint: 'На 30–50% легче, но не везде поддерживается' }
];

const qualityOptions = [
  { value: 'max', label: 'Макс.' },
  { value: 'high', label: 'Высокое' },
  { value: 'balanced', label: 'Баланс' },
  { value: 'compact', label: 'Компакт' }
];

let lastQuality = 'balanced';
function setCopy(on) {
  if (on) {
    if (s.quality !== 'copy') lastQuality = s.quality;
    s.quality = 'copy';
  } else {
    s.quality = lastQuality;
  }
}

const qualityNote = computed(
  () =>
    ({
      max: 'Визуально без потерь. Файлы крупные — для мастер-копий.',
      high: 'Отличное качество для публикации.',
      balanced: 'Хороший компромисс между весом и качеством.',
      compact: 'Минимальный вес, возможны артефакты в динамике.',
      copy: 'Потоки копируются как есть. Сработает, если кодеки подходят новому контейнеру (например, MKV → MP4 с H.264).'
    })[s.quality]
);

const speedOptions = [
  { value: 'fast', label: 'Быстро' },
  { value: 'balanced', label: 'Баланс' },
  { value: 'max', label: 'Макс.' }
];

const resolutions = [
  { value: 'original', label: 'Как в исходнике' },
  { value: '2160', label: '2160p · 4K' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p · Full HD' },
  { value: '720', label: '720p · HD' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
  { value: 'custom', label: 'Своё', hint: 'Вписать в рамку Ш × В' }
];

const fpsOptions = [
  { value: 'original', label: 'Как в исходнике' },
  { value: '60', label: '60' },
  { value: '50', label: '50' },
  { value: '30', label: '30' },
  { value: '25', label: '25' },
  { value: '24', label: '24' },
  { value: '15', label: '15' }
];

const bitrates = [96, 128, 160, 192, 256, 320].map((b) => ({ value: b, label: `${b} кбит/с` }));

const trimError = computed(() => {
  try {
    const a = parseTime(s.trimStart);
    const b = parseTime(s.trimEnd);
    if (a !== null && b !== null && b <= a) return 'Конец должен быть позже начала';
    return '';
  } catch (e) {
    return e.message;
  }
});

const trimSummary = computed(() => (s.trimStart || s.trimEnd ? `${s.trimStart || '0:00'} – ${s.trimEnd || 'конец'}` : 'целиком'));
</script>

<style scoped>
.subhead {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}

</style>
