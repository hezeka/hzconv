<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div v-if="open" class="modal" @mousedown.self="dismissable && $emit('close')">
        <div
          ref="dialog"
          class="modal__dialog"
          :class="[`modal__dialog--${size}`]"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          @keydown.esc.stop.prevent="$emit('close')"
        >
          <header v-if="title || $slots.header" class="modal__head">
            <slot name="header">
              <div class="modal__titles">
                <h2 class="modal__title">{{ title }}</h2>
                <p v-if="subtitle" class="modal__subtitle ellipsis">{{ subtitle }}</p>
              </div>
            </slot>
            <UiButton variant="ghost" size="s" icon="close" title="Закрыть (Esc)" @click="$emit('close')" />
          </header>
          <div class="modal__body" :class="{ 'modal__body--flush': flush }"><slot /></div>
          <footer v-if="$slots.footer" class="modal__foot"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import UiButton from './UiButton.vue';

const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  size: { type: String, default: 'm' }, // s | m | l | full
  flush: Boolean,
  dismissable: { type: Boolean, default: true }
});
defineEmits(['close']);

const dialog = ref(null);
watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    await nextTick();
    if (!dialog.value?.contains(document.activeElement)) dialog.value?.focus();
  },
  { immediate: true }
);
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 28px;
  background: var(--scrim);
  backdrop-filter: blur(2px);
}

@media (max-width: 700px), (max-height: 560px) {
  .modal {
    padding: 8px;
  }
}

.modal__dialog:focus,
.modal__dialog:focus-visible {
  outline: none;
}

.modal__dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 100%;
  background: var(--panel);
  border-radius: var(--r-l);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}

.modal__dialog--s {
  max-width: 420px;
}
.modal__dialog--m {
  max-width: 560px;
}
.modal__dialog--l {
  max-width: 880px;
}
.modal__dialog--full {
  max-width: none;
  height: 100%;
}

.modal__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 12px 20px;
  border-bottom: 1px solid var(--line);
}

.modal__titles {
  flex: 1;
  min-width: 0;
}

.modal__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.005em;
}

.modal__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.modal__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 20px;
}

.modal__body--flush {
  padding: 0;
  overflow: hidden;
  display: flex;
}

.modal__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 160ms var(--ease);
}
.modal-enter-active .modal__dialog,
.modal-leave-active .modal__dialog {
  transition: transform 200ms var(--ease), opacity 160ms var(--ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal__dialog,
.modal-leave-to .modal__dialog {
  transform: translateY(6px) scale(0.99);
  opacity: 0;
}
</style>
