<template>
  <section class="sec" :class="{ 'is-closed': collapsible && !isOpen }">
    <button v-if="collapsible" class="sec__head sec__head--btn" type="button" :aria-expanded="isOpen" @click="isOpen = !isOpen">
      <span class="sec__title">{{ title }}</span>
      <span v-if="!isOpen && summary" class="sec__summary ellipsis">{{ summary }}</span>
      <Icon name="chevron-down" :size="14" class="sec__chevron" />
    </button>
    <div v-else class="sec__head">
      <span class="sec__title">{{ title }}</span>
      <slot name="aside" />
    </div>
    <div v-show="!collapsible || isOpen" class="sec__body"><slot /></div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  collapsible: Boolean,
  open: { type: Boolean, default: true },
  storeKey: { type: String, default: '' }
});

const readStored = () => {
  if (!props.storeKey) return null;
  try {
    const v = localStorage.getItem(`hzconv.sec.${props.storeKey}`);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
};

const isOpen = ref(readStored() ?? props.open);
watch(isOpen, (v) => {
  if (props.storeKey) {
    try {
      localStorage.setItem(`hzconv.sec.${props.storeKey}`, v ? '1' : '0');
    } catch {
      /* не критично */
    }
  }
});
</script>

<style scoped>
.sec {
  padding: 14px 16px 16px;
  border-top: 1px solid var(--line);
}

.sec:first-child {
  border-top: 0;
}

.sec.is-closed {
  padding-bottom: 14px;
}

.sec__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  margin-bottom: 10px;
}

.is-closed .sec__head {
  margin-bottom: 0;
}

.sec__head--btn {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.sec__title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.003em;
}

.sec__summary {
  flex: 1;
  text-align: right;
  font-size: 11.5px;
  color: var(--text-3);
}

.sec__chevron {
  margin-left: auto;
  color: var(--text-3);
  transition: transform var(--t) var(--ease);
}

.is-closed .sec__chevron {
  transform: rotate(-90deg);
}

.sec__summary + .sec__chevron {
  margin-left: 0;
}

.sec__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
