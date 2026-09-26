<template>
  <button
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, { 'btn--icon': iconOnly, 'btn--block': block, 'is-active': active }]"
    :type="type"
    :disabled="disabled"
    :title="title"
    :aria-label="iconOnly ? title : undefined"
  >
    <Icon v-if="icon" :name="icon" :size="size === 'l' ? 17 : size === 's' ? 14 : 15" />
    <span v-if="!iconOnly" class="btn__label"><slot /></span>
    <span v-if="$slots.trail" class="btn__trail"><slot name="trail" /></span>
  </button>
</template>

<script setup>
import { computed, useSlots } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  variant: { type: String, default: 'secondary' }, // primary | secondary | ghost | danger
  size: { type: String, default: 'm' }, // s | m | l
  icon: { type: String, default: '' },
  title: { type: String, default: undefined },
  disabled: Boolean,
  block: Boolean,
  active: Boolean,
  type: { type: String, default: 'button' }
});

const slots = useSlots();
const iconOnly = computed(() => Boolean(props.icon) && !slots.default);
</script>

<style scoped>
.btn {
  --h: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: var(--h);
  padding: 0 12px;
  border-radius: var(--r-s);
  border: 1px solid transparent;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.005em;
  white-space: nowrap;
  transition: background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease),
    opacity var(--t-fast) var(--ease);
}

.btn--s {
  --h: 26px;
  padding: 0 9px;
  font-size: 12px;
  gap: 6px;
}
.btn--l {
  --h: 38px;
  padding: 0 16px;
  font-size: 13.5px;
  font-weight: 560;
  border-radius: var(--r);
}

.btn--icon {
  width: var(--h);
  padding: 0;
}

.btn--block {
  width: 100%;
}

.btn--primary {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 1px 2px rgba(0, 0, 0, 0.2);
}
.btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}
.btn--primary:active:not(:disabled) {
  background: var(--accent-press);
}

.btn--secondary {
  background: var(--panel-2);
  border-color: var(--line-2);
  color: var(--text);
  box-shadow: var(--shadow-control);
}
.btn--secondary:hover:not(:disabled) {
  background: var(--panel-3);
}

.btn--ghost {
  background: transparent;
  color: var(--text-2);
}
.btn--ghost:hover:not(:disabled),
.btn--ghost.is-active {
  background: var(--panel-3);
  color: var(--text);
}

.btn--danger {
  background: var(--err-soft);
  color: var(--err);
}
.btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--err) 20%, transparent);
}

.btn:disabled {
  opacity: 0.42;
}

.btn__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn__trail {
  display: inline-flex;
  margin-left: 2px;
  opacity: 0.7;
}
</style>
