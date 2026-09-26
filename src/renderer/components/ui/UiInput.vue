<template>
  <label class="input" :class="{ 'is-disabled': disabled, 'is-mono': mono }">
    <Icon v-if="icon" :name="icon" :size="14" class="input__icon" />
    <input
      ref="field"
      class="input__field"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      spellcheck="false"
      @input="$emit('update:modelValue', $event.target.value)"
      @keydown.esc="clearable && modelValue ? ($emit('update:modelValue', ''), $event.stopPropagation()) : null"
    />
    <button v-if="clearable && modelValue" class="input__clear" type="button" title="Очистить" @click="$emit('update:modelValue', '')">
      <Icon name="close" :size="12" />
    </button>
    <slot name="trail" />
  </label>
</template>

<script setup>
import { ref } from 'vue';
import Icon from './Icon.vue';

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  icon: { type: String, default: '' },
  disabled: Boolean,
  clearable: Boolean,
  mono: Boolean
});
defineEmits(['update:modelValue']);

const field = ref(null);
defineExpose({ focus: () => field.value?.focus() });
</script>

<style scoped>
.input {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  min-width: 0;
  padding: 0 4px 0 10px;
  background: var(--panel-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-s);
  box-shadow: var(--shadow-control);
  transition: border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease);
}

.input:focus-within {
  border-color: var(--accent-line);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.input__icon {
  color: var(--text-3);
}

.input__field {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  font-size: 12.5px;
}

.is-mono .input__field {
  font-family: var(--mono);
  font-size: 12px;
}

.input__field::placeholder {
  color: var(--text-3);
}

.input__clear {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
}

.input__clear:hover {
  background: var(--panel-3);
  color: var(--text);
}

.is-disabled {
  opacity: 0.45;
}
</style>
