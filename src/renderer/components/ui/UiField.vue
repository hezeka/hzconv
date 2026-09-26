<template>
  <div class="field" :class="{ 'field--stack': stack }">
    <div v-if="label" class="field__label">
      <span>{{ label }}</span>
      <span v-if="hint" class="field__hint">{{ hint }}</span>
    </div>
    <div class="field__control"><slot /></div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  stack: Boolean
});
</script>

<style scoped>
.field {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 34px;
}

.field--stack {
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.field__label {
  display: flex;
  flex-direction: column;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.3;
}

.field__hint {
  color: var(--text-3);
  font-size: 11.5px;
  margin-top: 2px;
}

.field--stack .field__label {
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.field__control {
  min-width: 0;
}
</style>
