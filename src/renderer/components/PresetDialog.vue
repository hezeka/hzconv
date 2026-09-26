<template>
  <UiModal :open="ui.presetDialog" title="Пресеты" size="s" @close="ui.presetDialog = false">
    <div class="pd">
      <UiField label="Название" stack>
        <UiInput ref="nameInput" v-model="name" placeholder="Например, «Каталог товаров»" @keydown.enter="save" />
      </UiField>
      <UiField label="Что сохранить" stack>
        <div class="chips">
          <button v-for="s in sections" :key="s.value" type="button" class="chip" :class="{ 'is-on': picked.includes(s.value) }" @click="toggle(s.value)">
            {{ s.label }}
          </button>
        </div>
      </UiField>

      <div v-if="userPresets.length" class="pd__list">
        <div class="pd__head">Мои пресеты</div>
        <div v-for="p in userPresets" :key="p.id" class="pd__item">
          <span class="ellipsis">{{ p.name }}</span>
          <UiButton variant="ghost" size="s" icon="trash" title="Удалить пресет" @click="deleteUserPreset(p.id)" />
        </div>
      </div>
    </div>
    <template #footer>
      <UiButton @click="ui.presetDialog = false">Отмена</UiButton>
      <UiButton variant="primary" :disabled="!name.trim() || !picked.length" @click="save">Сохранить</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { ui } from '../store/ui';
import { userPresets, saveUserPreset, deleteUserPreset } from '../store/settings';
import { toast } from '../store/toast';
import UiModal from './ui/UiModal.vue';
import UiField from './ui/UiField.vue';
import UiInput from './ui/UiInput.vue';
import UiButton from './ui/UiButton.vue';

const sections = [
  { value: 'image', label: 'Изображения' },
  { value: 'video', label: 'Видео' },
  { value: 'audio', label: 'Аудио' },
  { value: 'output', label: 'Сохранение' }
];

const name = ref('');
const picked = ref([]);
const nameInput = ref(null);

watch(
  () => ui.presetDialog,
  async (open) => {
    if (!open) return;
    name.value = '';
    picked.value = [ui.tab];
    await nextTick();
    nameInput.value?.focus();
  }
);

function toggle(v) {
  picked.value = picked.value.includes(v) ? picked.value.filter((x) => x !== v) : [...picked.value, v];
}

function save() {
  if (!name.value.trim() || !picked.value.length) return;
  const p = saveUserPreset(name.value, picked.value);
  toast(`Пресет «${p.name}» сохранён`, { kind: 'ok' });
  ui.presetDialog = false;
}
</script>

<style scoped>
.pd {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pd__list {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}

.pd__head {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 4px;
}

.pd__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 32px;
  font-size: 12.5px;
}
</style>
