<template>
  <section class="island" :class="{ 'is-closed': collapsible && !isOpen, 'is-collapsible': collapsible }">
    <button v-if="collapsible" class="island__head island__head--btn" type="button" :aria-expanded="isOpen" @click="isOpen = !isOpen">
      <span class="island__title">{{ title }}</span>
      <span v-if="summary" class="island__summary ellipsis">{{ summary }}</span>
      <Icon name="chevron-down" :size="15" class="island__chevron" />
    </button>
    <div v-else class="island__head">
      <span class="island__title">{{ title }}</span>
      <span v-if="summary" class="island__summary ellipsis">{{ summary }}</span>
      <slot name="aside" />
    </div>
    <div v-show="!collapsible || isOpen" class="island__body"><slot /></div>
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
/* Остров: такая же карточка, как панель очереди слева */
.island {
  flex: none;
  background: var(--panel);
  border-radius: var(--r-l);
  box-shadow: 0 0 0 1px var(--line);
}

.island__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 16px;
}

/* Сворачиваемый остров раскрывается щелчком по всей шапке, а не только по стрелке */
.island__head--btn {
  width: 100%;
  border: 0;
  border-radius: var(--r-l);
  background: transparent;
  text-align: left;
  transition: background var(--t-fast) var(--ease);
}

.island__head--btn:hover {
  background: var(--panel-2);
}

.island:not(.is-closed) .island__head--btn {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.island__title {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.005em;
}

.island__summary {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 12px;
  color: var(--text-3);
}

.island__chevron {
  flex: none;
  color: var(--text-3);
  transition: transform var(--t) var(--ease);
}

.island__summary + .island__chevron {
  margin-left: 2px;
}

.island__title + .island__chevron {
  margin-left: auto;
}

.is-closed .island__chevron {
  transform: rotate(-90deg);
}

.island__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 16px 16px;
}
</style>
