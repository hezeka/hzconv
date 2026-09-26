<template>
  <div class="el">
    <div class="el__head">
      <span>Ошибки <span class="num">{{ errors.length }}{{ truncated ? '+' : '' }}</span></span>
      <UiButton variant="ghost" size="s" icon="logs" title="Открыть папку журнала" @click="api.openLogs()">Журнал</UiButton>
    </div>
    <div class="el__list">
      <div v-for="(e, i) in errors" :key="i" class="el__item">
        <div class="el__main">
          <span class="mono ellipsis" :title="e.path">{{ e.rel || e.path }}</span>
          <span class="el__msg">{{ e.error }}</span>
        </div>
        <UiButton variant="ghost" size="s" icon="reveal" title="Показать файл" @click="api.reveal(e.path)" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { api } from '../api';
import UiButton from './ui/UiButton.vue';

defineProps({
  errors: { type: Array, required: true },
  truncated: Boolean
});
</script>

<style scoped>
.el {
  border-radius: var(--r);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--err) 25%, transparent);
  background: var(--err-soft);
  overflow: hidden;
}

.el__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 6px 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--err);
}

.el__list {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid color-mix(in srgb, var(--err) 18%, transparent);
}

.el__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 12px;
}

.el__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 11.5px;
}

.el__main .mono {
  color: var(--text);
}

.el__msg {
  color: var(--text-2);
}
</style>
