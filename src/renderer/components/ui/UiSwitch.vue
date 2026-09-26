<template>
  <label class="switch" :class="{ 'is-on': modelValue, 'is-disabled': disabled }">
    <span v-if="$slots.default" class="switch__label">
      <slot />
      <span v-if="hint" class="switch__hint">{{ hint }}</span>
    </span>
    <input
      type="checkbox"
      class="switch__input"
      role="switch"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
    <span class="switch__track" aria-hidden="true"><span class="switch__thumb" /></span>
  </label>
</template>

<script setup>
defineProps({
  modelValue: Boolean,
  disabled: Boolean,
  hint: { type: String, default: '' }
});
defineEmits(['update:modelValue']);
</script>

<style scoped>
.switch {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 30px;
  position: relative;
}

.switch__label {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  color: var(--text-2);
  font-size: 12.5px;
}

.switch__hint {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 1px;
}

.switch__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch__track {
  flex: none;
  width: 30px;
  height: 18px;
  border-radius: 10px;
  background: var(--panel-3);
  box-shadow: inset 0 0 0 1px var(--line-2);
  position: relative;
  transition: background var(--t) var(--ease), box-shadow var(--t) var(--ease);
}

.switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  transition: transform var(--t) var(--ease);
}

.is-on .switch__track {
  background: var(--accent);
  box-shadow: none;
}

.is-on .switch__thumb {
  transform: translateX(12px);
}

.switch__input:focus-visible + .switch__track {
  outline: 2px solid var(--accent-line);
  outline-offset: 2px;
}

.is-disabled {
  opacity: 0.45;
}
</style>
