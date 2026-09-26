<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast--${t.kind}`" @click="dismiss(t.id)">
        <Icon :name="icons[t.kind]" :size="15" class="toast__icon" />
        <span class="toast__text">{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { toasts, dismiss } from '../store/toast';
import Icon from './ui/Icon.vue';

const icons = { info: 'info', ok: 'check', warn: 'alert', error: 'alert' };
</script>

<style scoped>
.toasts {
  position: fixed;
  left: calc((100% - var(--inspector-w) - 24px) / 2);
  bottom: 60px;
  transform: translateX(-50%);
  z-index: 5000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 520px;
  padding: 9px 14px 9px 12px;
  border-radius: 10px;
  background: var(--panel-raised);
  box-shadow: var(--shadow-pop);
  font-size: 12.5px;
  color: var(--text);
  pointer-events: auto;
}

.toast__icon {
  color: var(--text-2);
}

.toast--ok .toast__icon {
  color: var(--ok);
}
.toast--warn .toast__icon {
  color: var(--warn);
}
.toast--error .toast__icon {
  color: var(--err);
}

.toast__text {
  line-height: 1.4;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms var(--ease), transform 220ms var(--ease);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
.toast-move {
  transition: transform 220ms var(--ease);
}
</style>
