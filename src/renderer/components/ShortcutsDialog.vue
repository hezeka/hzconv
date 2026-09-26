<template>
  <UiModal :open="ui.shortcuts" title="Справка" size="s" @close="ui.shortcuts = false">
    <section class="block">
      <h3 class="caption">Горячие клавиши</h3>
      <dl class="keys">
        <template v-for="k in keys" :key="k.label">
          <dt>{{ k.label }}</dt>
          <dd>
            <kbd v-for="part in k.combo" :key="part">{{ part }}</kbd>
          </dd>
        </template>
      </dl>
    </section>

    <section v-if="prefs" class="block block--split">
      <h3 class="caption">Отрисовка</h3>
      <UiSwitch :model-value="prefs.hardwareAcceleration" hint="Выключите, если текст рвётся или на экране остаются следы элементов" @update:model-value="setAcceleration">
        Аппаратное ускорение
      </UiSwitch>
      <div v-if="pending" class="restart">
        <span>Применится после перезапуска</span>
        <UiButton size="s" :disabled="busy" :title="busy ? 'Дождитесь конца конвертации' : ''" @click="relaunch">Перезапустить</UiButton>
      </div>
    </section>

    <template #footer>
      <span class="about">Hzconv {{ version }}</span>
      <UiButton variant="ghost" size="s" icon="logs" @click="api.openLogs()">Журнал ошибок</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { api, platform } from '../api';
import { ui } from '../store/ui';
import { queue } from '../store/queue';
import { batch } from '../store/batch';
import { toast } from '../store/toast';
import UiModal from './ui/UiModal.vue';
import UiButton from './ui/UiButton.vue';
import UiSwitch from './ui/UiSwitch.vue';

const version = ref('');
const prefs = ref(null);

watch(
  () => ui.shortcuts,
  async (open) => {
    if (!open) return;
    if (!version.value) version.value = (await api.info()).version;
    prefs.value = await api.prefs();
  }
);

const busy = computed(() => queue.running || batch.running);
const pending = computed(() => prefs.value && prefs.value.hardwareAcceleration !== prefs.value.hardwareAccelerationActive);

async function setAcceleration(value) {
  prefs.value = await api.setPrefs({ hardwareAcceleration: value });
}

async function relaunch() {
  try {
    await api.relaunch();
  } catch (e) {
    toast(e.message, { kind: 'error' });
  }
}

const mod = platform === 'darwin' ? '⌘' : 'Ctrl';

const keys = [
  { label: 'Добавить файлы (режим «Файлы»)', combo: [mod, 'O'] },
  { label: 'Добавить папку', combo: [mod, 'Shift', 'O'] },
  { label: 'Вставить картинку из буфера', combo: [mod, 'V'] },
  { label: 'Конвертировать / запустить задание', combo: [mod, 'Enter'] },
  { label: 'Остановить', combo: ['Esc'] },
  { label: 'Выбрать файл', combo: ['↑', '↓'] },
  { label: 'Предпросмотр результата', combo: ['Пробел'] },
  { label: 'Кадр и поворот', combo: ['C'] },
  { label: 'Убрать из очереди', combo: ['Delete'] },
  { label: 'В редакторе: сдвиг рамки', combo: ['←', '→', 'Shift'] },
  { label: 'В редакторе: применить', combo: ['Enter'] },
  { label: 'Эта справка', combo: ['?'] }
];
</script>

<style scoped>
.block--split {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.caption {
  margin: 0 0 12px;
  font-size: 11.5px;
  font-weight: 560;
  color: var(--text-3);
}

.keys {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px 16px;
  margin: 0;
  font-size: 12.5px;
}

dt {
  color: var(--text-2);
}

dd {
  margin: 0;
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.restart {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 8px 8px 8px 12px;
  border-radius: var(--r);
  background: var(--panel-2);
  box-shadow: inset 0 0 0 1px var(--line);
  font-size: 12px;
  color: var(--text-2);
}

.about {
  margin-right: auto;
  font-size: 12px;
  color: var(--text-3);
}
</style>
