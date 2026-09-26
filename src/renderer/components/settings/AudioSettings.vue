<template>
  <UiSection title="Формат">
    <FormatGrid v-model="s.format" :formats="formats" />
    <p class="note">{{ formatNote }}</p>
  </UiSection>

  <UiSection title="Параметры">
    <UiField label="Битрейт">
      <UiSelect v-model="s.bitrate" :options="bitrates" :disabled="!lossy" />
    </UiField>
    <UiField label="Частота">
      <UiSelect v-model="s.sampleRate" :options="rates" />
    </UiField>
    <UiField label="Каналы">
      <UiSegmented v-model="s.channels" :options="channels" />
    </UiField>
    <UiSwitch v-model="s.normalize" hint="−16 LUFS, как на стриминговых площадках">Выровнять громкость</UiSwitch>
  </UiSection>

  <OutputSettings />

  <UiSection title="Фрагмент" collapsible store-key="audio-trim" :open="false" :summary="trimSummary">
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
    <UiButton variant="ghost" size="s" icon="reset" @click="resetSection('audio')">Сбросить настройки аудио</UiButton>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { settings, resetSection } from '../../store/settings';
import { outputFormats } from '../../utils/targets';
import { parseTime } from '../../utils/time';
import UiSection from '../ui/UiSection.vue';
import UiField from '../ui/UiField.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiSegmented from '../ui/UiSegmented.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiInput from '../ui/UiInput.vue';
import UiButton from '../ui/UiButton.vue';
import OutputSettings from './OutputSettings.vue';
import FormatGrid from '../ui/FormatGrid.vue';

const s = settings.audio;

const NOTES = { original: 'не меняется', mp3: 'везде', m4a: 'AAC', ogg: 'Vorbis', opus: 'голос', flac: 'без потерь', wav: 'без сжатия' };
const formats = outputFormats('audio').map((f) => ({ id: f.id, label: f.label, note: NOTES[f.id] }));
const lossy = computed(() => !['flac', 'wav'].includes(s.format));

const formatNote = computed(
  () =>
    ({
      original: 'Формат сохраняется — удобно, чтобы только обрезать или выровнять громкость.',
      mp3: 'Совместим со всем. 192 кбит/с достаточно для музыки.',
      m4a: 'AAC: при том же битрейте звучит чище MP3.',
      ogg: 'Открытый формат, хорош для игр и веба.',
      opus: 'Лучший кодек для речи и низких битрейтов.',
      flac: 'Сжатие без потерь — для архива и мастеринга.',
      wav: 'Несжатый PCM 16 бит — для монтажа.'
    })[s.format]
);

const bitrates = [64, 96, 128, 160, 192, 256, 320].map((b) => ({ value: b, label: `${b} кбит/с` }));
const rates = [
  { value: 'original', label: 'Как в исходнике' },
  { value: '22050', label: '22,05 кГц' },
  { value: '44100', label: '44,1 кГц' },
  { value: '48000', label: '48 кГц' }
];
const channels = [
  { value: 'original', label: 'Исходные' },
  { value: '1', label: 'Моно' },
  { value: '2', label: 'Стерео' }
];

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

