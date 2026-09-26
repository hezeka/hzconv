<template>
  <div class="color">
    <label class="color__swatch checker" :title="modelValue">
      <span class="color__fill" :style="{ background: modelValue }" />
      <input type="color" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />
    </label>
    <UiInput class="color__hex" mono :model-value="draft" @update:model-value="onHex" />
    <div class="color__presets">
      <button
        v-for="c in presets"
        :key="c"
        class="color__preset"
        :class="{ 'is-on': c.toLowerCase() === modelValue.toLowerCase() }"
        type="button"
        :title="c"
        :style="{ background: c }"
        @click="$emit('update:modelValue', c)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import UiInput from './UiInput.vue';

const props = defineProps({ modelValue: { type: String, default: '#ffffff' } });
const emit = defineEmits(['update:modelValue']);

const presets = ['#ffffff', '#000000', '#f4f4f1'];
const draft = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => (draft.value = v)
);

function onHex(v) {
  draft.value = v;
  const s = v.trim().startsWith('#') ? v.trim() : `#${v.trim()}`;
  if (/^#[0-9a-f]{6}$/i.test(s)) emit('update:modelValue', s.toLowerCase());
  else if (/^#[0-9a-f]{3}$/i.test(s)) emit('update:modelValue', `#${[...s.slice(1)].map((c) => c + c).join('')}`.toLowerCase());
}
</script>

<style scoped>
.color {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color__swatch {
  position: relative;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: var(--r-s);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--line-2);
}

.color__fill {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 1px var(--line-2);
  border-radius: inherit;
}

.color__swatch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
}

.color__hex {
  width: 96px;
  flex: none;
}

.color__presets {
  display: flex;
  gap: 5px;
  margin-left: auto;
}

.color__preset {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  box-shadow: inset 0 0 0 1px var(--line-3);
}

.color__preset.is-on {
  box-shadow: inset 0 0 0 1px var(--line-3), 0 0 0 2px var(--panel), 0 0 0 3.5px var(--accent);
}
</style>
