<template>
  <div class="fgrid" role="radiogroup">
    <button
      v-for="f in formats"
      :key="f.id"
      type="button"
      role="radio"
      class="fgrid__item"
      :class="{ 'is-on': f.id === modelValue, 'is-wide': f.id === 'original' }"
      :aria-checked="f.id === modelValue"
      :title="f.hint"
      @click="$emit('update:modelValue', f.id)"
    >
      <span class="fgrid__label">{{ f.label }}</span>
      <span v-if="f.note" class="fgrid__note">{{ f.note }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  formats: { type: Array, required: true } // { id, label, note?, hint? }
});
defineEmits(['update:modelValue']);
</script>

<style scoped>
.fgrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}

.fgrid__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 4px;
  border-radius: var(--r-s);
  border: 1px solid var(--line-2);
  background: var(--panel-2);
  color: var(--text-2);
  transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
}

.fgrid__item.is-wide {
  grid-column: span 2;
}

.fgrid__item:hover:not(.is-on) {
  color: var(--text);
  border-color: var(--line-3);
}

.fgrid__item.is-on {
  border-color: var(--accent-line);
  background: var(--accent-soft);
  color: var(--accent);
}

.fgrid__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.fgrid__note {
  font-size: 9.5px;
  line-height: 1.1;
  color: var(--text-3);
  font-weight: 450;
}

.is-on .fgrid__note {
  color: color-mix(in srgb, var(--accent) 70%, transparent);
}
</style>
