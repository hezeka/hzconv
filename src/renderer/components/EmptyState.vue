<template>
  <div class="empty">
    <div class="empty__stage">
      <div class="empty__art" aria-hidden="true">
        <span class="empty__sheet empty__sheet--a"><Icon name="music" :size="18" /></span>
        <span class="empty__sheet empty__sheet--b"><Icon name="film" :size="18" /></span>
        <span class="empty__sheet empty__sheet--c"><Icon name="image" :size="20" /></span>
      </div>

      <h1 class="empty__title">Перетащите файлы или папки</h1>
      <p class="empty__text">Изображения, видео и аудио — по одному или целыми папками с сохранением структуры</p>

      <div class="empty__actions">
        <UiButton variant="primary" icon="plus" @click="addFiles">Выбрать файлы</UiButton>
        <UiButton icon="folder" @click="addFolder">Добавить папку</UiButton>
      </div>

      <div v-if="!ui.narrow" class="empty__keys">
        <span><kbd>{{ mod }}</kbd> <kbd>O</kbd> файлы</span>
        <span><kbd>{{ mod }}</kbd> <kbd>V</kbd> из буфера</span>
      </div>
    </div>

    <dl v-if="!ui.compact" class="empty__formats">
      <div v-for="g in groups" :key="g.label">
        <dt>{{ g.label }}</dt>
        <dd class="mono">{{ g.list }}</dd>
      </div>
    </dl>
  </div>
</template>

<script setup>
import { platform } from '../api';
import { ui } from '../store/ui';
import { useAddActions } from '../composables/useAddActions';
import { inputFormats } from '../utils/targets';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';

const { addFiles, addFolder } = useAddActions();
const mod = platform === 'darwin' ? '⌘' : 'Ctrl';

const pick = (type, skip = []) =>
  inputFormats(type)
    .filter((f) => !skip.includes(f))
    .map((f) => f.toUpperCase())
    .join('  ');

const groups = [
  { label: 'Изображения', list: pick('image', ['jpeg', 'jpe', 'jfif', 'tif']) },
  { label: 'Видео', list: pick('video', ['m4v', 'mpeg', 'mts', 'm2ts', 'ogv']) },
  { label: 'Аудио', list: pick('audio', ['oga', 'aif']) }
];
</script>

<style scoped>
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.empty__stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px;
  border-radius: 10px;
  background: radial-gradient(ellipse 60% 50% at 50% 42%, var(--panel-2), transparent 70%);
}

.empty__art {
  position: relative;
  width: 132px;
  height: 92px;
  margin-bottom: 28px;
}

.empty__sheet {
  position: absolute;
  top: 10px;
  left: 38px;
  width: 58px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--panel-raised);
  box-shadow: 0 0 0 1px var(--line-2), 0 10px 24px rgba(0, 0, 0, 0.22);
  color: var(--text-3);
  transition: transform 400ms var(--ease);
}

.empty__sheet--a {
  transform: translateX(-30px) rotate(-11deg);
}
.empty__sheet--b {
  transform: translateX(30px) rotate(11deg);
}
.empty__sheet--c {
  top: 4px;
  color: var(--accent);
  box-shadow: 0 0 0 1px var(--line-2), 0 14px 30px rgba(0, 0, 0, 0.3);
}

.empty__stage:hover .empty__sheet--a {
  transform: translateX(-38px) rotate(-15deg);
}
.empty__stage:hover .empty__sheet--b {
  transform: translateX(38px) rotate(15deg);
}
.empty__stage:hover .empty__sheet--c {
  transform: translateY(-4px);
}

.empty__title {
  margin: 0;
  font-size: 19px;
  font-weight: 620;
  letter-spacing: -0.02em;
}

.empty__text {
  max-width: 380px;
  margin: 8px 0 22px;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
}

.empty__actions {
  display: flex;
  gap: 8px;
}

.empty__keys {
  display: flex;
  gap: 18px;
  margin-top: 22px;
  font-size: 12px;
  color: var(--text-3);
}

.empty__keys kbd {
  margin-right: 1px;
}

@media (max-height: 560px) {
  .empty__art {
    display: none;
  }
}

.is-narrow .empty__stage {
  padding: 20px 12px;
}

.is-narrow .empty__actions {
  flex-direction: column;
  width: 100%;
  max-width: 260px;
}

.empty__formats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
  padding: 14px 12px 6px;
  border-top: 1px solid var(--line);
}

.empty__formats div {
  min-width: 0;
}

.empty__formats dt {
  font-size: 11.5px;
  font-weight: 560;
  color: var(--text-2);
  margin-bottom: 4px;
}

.empty__formats dd {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-3);
  word-spacing: 2px;
}
</style>
