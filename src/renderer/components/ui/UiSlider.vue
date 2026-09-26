<template>
  <div class="slider" :class="{ 'is-disabled': disabled }">
    <div class="slider__track">
      <div class="slider__fill" :style="{ width: `${pct}%` }" />
      <input
        class="slider__input"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        @input="$emit('update:modelValue', Number($event.target.value))"
      />
    </div>
    <UiNumber
      v-if="showInput"
      class="slider__num"
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :suffix="suffix"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import UiNumber from './UiNumber.vue';

const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  suffix: { type: String, default: '' },
  showInput: { type: Boolean, default: true },
  disabled: Boolean
});
defineEmits(['update:modelValue']);

const pct = computed(() => ((props.modelValue - props.min) / (props.max - props.min || 1)) * 100);
</script>

<style scoped>
.slider {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.slider__track {
  position: relative;
  flex: 1;
  height: 18px;
  display: flex;
  align-items: center;
}

.slider__track::before {
  content: '';
  position: absolute;
  inset: 7px 0;
  border-radius: 4px;
  background: var(--panel-3);
  box-shadow: inset 0 0 0 1px var(--line);
}

.slider__fill {
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  border-radius: 4px;
  background: var(--accent);
}

.slider__input {
  position: relative;
  width: 100%;
  margin: 0;
  height: 18px;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
}

.slider__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform var(--t-fast) var(--ease);
}

.slider__input:active::-webkit-slider-thumb {
  transform: scale(1.12);
}

.slider__input:focus-visible {
  outline: none;
}

.slider__input:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px var(--accent-line);
}

.slider__num {
  width: 64px;
  flex: none;
}

.is-disabled {
  opacity: 0.45;
}
</style>
