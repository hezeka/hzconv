<template>
  <label class="num-input" :class="{ 'is-disabled': disabled, 'has-prefix': prefix }">
    <span v-if="prefix" class="num-input__prefix">{{ prefix }}</span>
    <input
      ref="input"
      class="num-input__field num"
      type="text"
      inputmode="decimal"
      :value="draft"
      :disabled="disabled"
      :placeholder="placeholder"
      @input="draft = $event.target.value"
      @blur="commit"
      @keydown.enter.prevent="commit(), $event.target.blur()"
      @keydown.up.prevent="nudge($event.shiftKey ? 10 : 1)"
      @keydown.down.prevent="nudge($event.shiftKey ? -10 : -1)"
      @focus="$event.target.select()"
    />
    <span v-if="suffix" class="num-input__suffix">{{ suffix }}</span>
  </label>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: [Number, String, null], default: null },
  min: { type: Number, default: -Infinity },
  max: { type: Number, default: Infinity },
  step: { type: Number, default: 1 },
  prefix: { type: String, default: '' },
  suffix: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: Boolean
});
const emit = defineEmits(['update:modelValue']);

const draft = ref(String(props.modelValue ?? ''));
watch(
  () => props.modelValue,
  (v) => {
    draft.value = String(v ?? '');
  }
);

const decimals = String(props.step).split('.')[1]?.length || 0;
const clamp = (v) => Math.min(props.max, Math.max(props.min, v));

function commit() {
  const n = parseFloat(String(draft.value).replace(',', '.'));
  if (!Number.isFinite(n)) {
    draft.value = String(props.modelValue ?? '');
    return;
  }
  const v = Number(clamp(n).toFixed(decimals));
  draft.value = String(v);
  if (v !== props.modelValue) emit('update:modelValue', v);
}

function nudge(k) {
  const base = Number(props.modelValue) || 0;
  const v = Number(clamp(base + k * props.step).toFixed(decimals));
  emit('update:modelValue', v);
}
</script>

<style scoped>
.num-input {
  display: flex;
  align-items: center;
  height: 30px;
  min-width: 0;
  padding: 0 8px;
  gap: 4px;
  background: var(--panel-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-s);
  box-shadow: var(--shadow-control);
  transition: border-color var(--t-fast) var(--ease);
}

.num-input:focus-within {
  border-color: var(--accent-line);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.num-input__field {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  text-align: right;
  font-size: 12px;
}

.has-prefix .num-input__field {
  text-align: left;
}

.num-input__prefix,
.num-input__suffix {
  font-size: 11px;
  color: var(--text-3);
  flex: none;
}

.is-disabled {
  opacity: 0.45;
}
</style>
