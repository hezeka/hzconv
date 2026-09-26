<template>
  <div class="seg" :class="{ 'seg--wrap': wrap, 'seg--small': small }" role="radiogroup">
    <button
      v-for="opt in normalized"
      :key="String(opt.value)"
      class="seg__item"
      :class="{ 'is-on': opt.value === modelValue }"
      type="button"
      role="radio"
      :aria-checked="opt.value === modelValue"
      :disabled="opt.disabled"
      :title="opt.hint"
      @click="$emit('update:modelValue', opt.value)"
    >
      <Icon v-if="opt.icon" :name="opt.icon" :size="14" />
      <span v-if="opt.label">{{ opt.label }}</span>
      <span v-if="opt.count !== undefined" class="seg__count num">{{ opt.count }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: null },
  options: { type: Array, required: true },
  wrap: Boolean,
  small: Boolean
});
defineEmits(['update:modelValue']);

const normalized = computed(() => props.options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) })));
</script>

<style scoped>
.seg {
  display: flex;
  padding: 2px;
  gap: 2px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 7px;
  min-width: 0;
}

.seg--wrap {
  flex-wrap: wrap;
}

.seg__item {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
}

.seg--small .seg__item {
  height: 22px;
  font-size: 11.5px;
  padding: 0 6px;
}

.seg__item:hover:not(:disabled):not(.is-on) {
  color: var(--text);
}

.seg__item.is-on {
  background: var(--panel-raised);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22), 0 0 0 1px var(--line-2);
}

.seg__count {
  font-size: 10.5px;
  color: var(--text-3);
}

.seg__item.is-on .seg__count {
  color: var(--text-2);
}

.seg__item:disabled {
  opacity: 0.35;
}
</style>
