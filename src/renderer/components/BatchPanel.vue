<template>
  <section class="bp panel">
    <!-- Нет заданий -->
    <div v-if="!batch.jobs.length" class="bp-empty">
      <div class="bp-empty__icon"><Icon name="layers" :size="26" /></div>
      <h1 class="bp-empty__title">Пакетная обработка</h1>
      <p class="bp-empty__text">
        Задание запоминает папку, выбранные подпапки, формат и путь сохранения. В следующий раз достаточно открыть программу и нажать «Запустить» —
        обработаются только новые и изменённые файлы.
      </p>
      <UiButton variant="primary" icon="folder-open" @click="createJob">Выбрать папку</UiButton>
    </div>

    <template v-else-if="job">
      <!-- Задание -->
      <div class="bp-bar">
        <div v-if="renaming" class="bp-rename">
          <UiInput ref="renameInput" v-model="renameValue" @keydown.enter="finishRename" @keydown.esc.stop="renaming = false" />
          <UiButton size="s" variant="primary" @click="finishRename">Готово</UiButton>
        </div>
        <template v-else>
          <UiSelect v-model="batch.activeId" :options="jobOptions" :disabled="batch.running" class="bp-bar__select" />
          <div class="bp-bar__tools">
            <UiButton variant="ghost" size="s" icon="edit" title="Переименовать" :disabled="batch.running" @click="startRename" />
            <UiButton variant="ghost" size="s" icon="copy" title="Дублировать задание" :disabled="batch.running" @click="duplicateJob" />
            <UiButton variant="ghost" size="s" icon="plus" title="Новое задание" :disabled="batch.running" @click="createJob" />
            <UiButton variant="ghost" size="s" icon="trash" title="Удалить задание" :disabled="batch.running" @click="confirmDelete" />
          </div>
        </template>
      </div>

      <!-- Идёт обработка -->
      <div v-if="batch.running && p" class="bp-run">
        <div class="bp-run__head">
          <div class="bp-run__count num">
            <b>{{ fmt(processed) }}</b> <span>из {{ fmt(p.total) }}</span>
          </div>
          <div class="bp-run__pct num">{{ Math.floor(ratio * 100) }}%</div>
        </div>
        <div class="bp-run__bar"><div :style="{ transform: `scaleX(${ratio})` }" /></div>
        <div class="bp-run__meta num">
          <span v-if="speed">{{ speedText }}</span>
          <span v-if="eta">осталось ≈ {{ eta }}</span>
          <span>{{ formatElapsed(p.elapsed) }}</span>
        </div>
        <div class="bp-stats">
          <div class="bp-stat"><span class="bp-stat__n num good">{{ fmt(p.done) }}</span><span>готово</span></div>
          <div class="bp-stat"><span class="bp-stat__n num">{{ fmt(p.skipped) }}</span><span>без изменений</span></div>
          <div class="bp-stat"><span class="bp-stat__n num" :class="{ bad: p.failed }">{{ fmt(p.failed) }}</span><span>ошибок</span></div>
          <div class="bp-stat"><span class="bp-stat__n num">{{ savedText }}</span><span>экономия</span></div>
        </div>
        <div class="bp-current">
          <div class="bp-label">Сейчас</div>
          <div v-for="c in p.current" :key="c.name" class="bp-current__item">
            <span class="ellipsis mono">{{ c.name }}</span>
            <span v-if="c.progress" class="num faint">{{ Math.round(c.progress * 100) }}%</span>
          </div>
          <div v-if="!p.current.length" class="faint">Подготовка…</div>
        </div>
        <ErrorList v-if="batch.errors.length" :errors="batch.errors" />
      </div>

      <!-- Настройка задания -->
      <div v-else class="bp-body">
        <div v-if="batch.summary" class="bp-summary" :class="`is-${summaryKind}`">
          <Icon :name="summaryKind === 'ok' ? 'check' : 'alert'" :size="16" class="bp-summary__icon" />
          <div class="bp-summary__text">
            <b>{{ summaryTitle }}</b>
            <span class="num">
              готово {{ fmt(batch.summary.done) }} · без изменений {{ fmt(batch.summary.skipped) }} · ошибок {{ fmt(batch.summary.failed) }} · {{ formatElapsed(batch.summary.elapsed) }}
              <template v-if="batch.summary.done && batch.summary.bytesIn"> · {{ formatBytes(batch.summary.bytesIn) }} → {{ formatBytes(batch.summary.bytesOut) }}</template>
            </span>
          </div>
          <div class="bp-summary__actions">
            <UiButton v-if="batch.summary.failed" size="s" icon="refresh" @click="retryErrors">Повторить ошибки</UiButton>
            <UiButton v-if="batch.summary.outputDirs.length" size="s" icon="reveal" @click="api.openPath(commonDir)">Открыть результат</UiButton>
            <UiButton variant="ghost" size="s" icon="close" title="Скрыть" @click="batch.summary = null" />
          </div>
        </div>
        <ErrorList v-if="batch.summary && batch.errors.length" :errors="batch.errors" :truncated="batch.summary.errorsTruncated" />

        <div class="bp-source">
          <div class="bp-label">Папка</div>
          <div class="bp-path">
            <Icon name="folder" :size="15" class="bp-path__icon" />
            <span class="bp-path__text mono ellipsis" :title="job.source.dir">{{ job.source.dir || 'не выбрана' }}</span>
            <UiButton size="s" variant="ghost" icon="reveal" title="Открыть в проводнике" :disabled="!job.source.dir" @click="api.openPath(job.source.dir)" />
            <UiButton size="s" @click="changeJobDir">Изменить</UiButton>
          </div>
          <div class="bp-opts">
            <UiSwitch v-model="job.source.recursive" class="bp-opts__switch">Вложенные папки</UiSwitch>
            <UiSegmented v-model="job.source.types" small :options="typeOptions" class="bp-opts__types" />
          </div>
          <UiInput v-model="job.source.extensions" mono clearable placeholder="Только расширения, например: png, jpg — пусто = все поддерживаемые" />
        </div>

        <FolderTree v-if="job.source.recursive" v-model="job.source.excluded" :folders="batch.folders" :loading="batch.foldersLoading" class="bp-tree" />

        <div v-if="batch.preview" class="bp-preview">
          <div class="bp-label">Куда попадут файлы — пример</div>
          <div class="bp-preview__row mono">
            <span class="ellipsis" :title="batch.preview.input">{{ previewPaths.input }}</span>
          </div>
          <div class="bp-preview__row mono">
            <Icon name="arrow" :size="13" class="faint" />
            <span class="ellipsis accent" :title="batch.preview.output">{{ previewPaths.output }}</span>
          </div>
        </div>
      </div>

      <footer class="bp-foot">
        <template v-if="batch.scanError">
          <Icon name="alert" :size="14" class="bad" />
          <span class="bad ellipsis">{{ batch.scanError }}</span>
        </template>
        <template v-else-if="batch.stats">
          <span><b class="num">{{ fmt(batch.stats.count) }}</b> {{ plural(batch.stats.count, 'файл', 'файла', 'файлов') }}</span>
          <span class="num faint">{{ formatBytes(batch.stats.bytes) }}</span>
          <span class="faint">{{ typeBreakdown }}</span>
        </template>
        <span v-else class="faint">{{ batch.scanning ? 'Подсчёт файлов…' : '' }}</span>
        <span v-if="job.lastRun && !batch.running" class="faint bp-foot__last">Запуск {{ lastRunText }}</span>
        <UiButton variant="ghost" size="s" icon="refresh" title="Пересчитать" :disabled="batch.running || batch.scanning" @click="rescan" />
      </footer>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { api } from '../api';
import { batch, activeJob, createJob, duplicateJob, deleteJob, changeJobDir, rescan, retryErrors } from '../store/batch';
import { formatBytes, formatDelta, formatElapsed, formatDuration, plural } from '../utils/format';
import Icon from './ui/Icon.vue';
import UiButton from './ui/UiButton.vue';
import UiSelect from './ui/UiSelect.vue';
import UiInput from './ui/UiInput.vue';
import UiSwitch from './ui/UiSwitch.vue';
import UiSegmented from './ui/UiSegmented.vue';
import FolderTree from './FolderTree.vue';
import ErrorList from './ErrorList.vue';

const job = activeJob;
const p = computed(() => batch.progress);
const nf = new Intl.NumberFormat('ru-RU');
const fmt = (n) => nf.format(n || 0);

const jobOptions = computed(() => batch.jobs.map((j) => ({ value: j.id, label: j.name, hint: j.source.dir })));
const typeOptions = [
  { value: 'all', label: 'Все' },
  { value: 'image', label: 'Фото' },
  { value: 'video', label: 'Видео' },
  { value: 'audio', label: 'Аудио' }
];

// ——— Переименование и удаление ———
const renaming = ref(false);
const renameValue = ref('');
const renameInput = ref(null);
async function startRename() {
  renameValue.value = job.value.name;
  renaming.value = true;
  await nextTick();
  renameInput.value?.focus();
}
function finishRename() {
  if (renameValue.value.trim()) job.value.name = renameValue.value.trim();
  renaming.value = false;
}
function confirmDelete() {
  if (window.confirm(`Удалить задание «${job.value.name}»? Файлы на диске не затрагиваются.`)) deleteJob(job.value.id);
}

// ——— Прогресс ———
const processed = computed(() => (p.value ? p.value.done + p.value.failed + p.value.skipped + p.value.cancelled : 0));
const ratio = computed(() => (p.value?.total ? Math.min(1, processed.value / p.value.total) : 0));
const speed = computed(() => (p.value && p.value.elapsed > 1500 && processed.value ? processed.value / (p.value.elapsed / 1000) : 0));
const speedText = computed(() => (speed.value >= 1 ? `${speed.value.toFixed(speed.value >= 10 ? 0 : 1)} файл./с` : `${(1 / speed.value).toFixed(1)} с на файл`));
const eta = computed(() => {
  if (!speed.value || !p.value) return '';
  const left = (p.value.total - processed.value) / speed.value;
  return left > 1 ? formatDuration(left) : '';
});
const savedText = computed(() => (p.value?.bytesIn ? formatDelta(p.value.bytesIn, p.value.bytesOut) : '—'));

// ——— Итог ———
const summaryKind = computed(() => {
  const s = batch.summary;
  if (!s) return 'ok';
  if (s.failed || s.wasCancelled) return 'warn';
  return 'ok';
});
const summaryTitle = computed(() => {
  const s = batch.summary;
  if (s.wasCancelled) return 'Остановлено';
  if (!s.done && s.skipped && !s.failed) return 'Всё уже актуально';
  return s.failed ? 'Готово с ошибками' : 'Готово';
});

function commonPrefix(paths) {
  if (!paths.length) return '';
  const sep = paths[0].includes('\\') ? '\\' : '/';
  const split = paths.map((x) => x.split(sep));
  const out = [];
  for (let i = 0; i < split[0].length; i++) {
    const part = split[0][i];
    if (split.every((s) => s[i] === part)) out.push(part);
    else break;
  }
  return out.join(sep) || sep;
}
const commonDir = computed(() => commonPrefix(batch.summary?.outputDirs || []));

// Пример пути показываем относительно общей родительской папки — видно, куда уходит ../cards
const previewPaths = computed(() => {
  const pr = batch.preview;
  if (!pr) return { input: '', output: '' };
  const base = commonPrefix([pr.input, pr.output].map((x) => x.split(/[\\/]/).slice(0, -1).join(x.includes('\\') ? '\\' : '/')));
  const strip = (x) => (base && x.startsWith(base) ? `…${x.slice(base.length)}` : x);
  return { input: strip(pr.input), output: strip(pr.output) };
});

const typeBreakdown = computed(() => {
  const b = batch.stats?.byType;
  if (!b) return '';
  return [b.image && `фото ${fmt(b.image)}`, b.video && `видео ${fmt(b.video)}`, b.audio && `аудио ${fmt(b.audio)}`].filter(Boolean).join(' · ');
});

const lastRunText = computed(() => {
  const r = job.value?.lastRun;
  if (!r) return '';
  const d = new Date(r.at);
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const parts = [];
  if (r.done || !r.skipped) parts.push(`готово ${fmt(r.done)}`);
  if (r.skipped) parts.push(`без изменений ${fmt(r.skipped)}`);
  if (r.failed) parts.push(`ошибок ${fmt(r.failed)}`);
  return `${date}, ${time}: ${parts.join(', ')}`;
});
</script>

<style scoped>
.panel {
  background: var(--panel);
  border-radius: var(--r-l);
  box-shadow: 0 0 0 1px var(--line);
  overflow: hidden;
}

.bp {
  display: flex;
  flex-direction: column;
}

.bp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px;
  gap: 4px;
}

.bp-empty__icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 16px;
}

.bp-empty__title {
  margin: 0;
  font-size: 19px;
  font-weight: 620;
  letter-spacing: -0.02em;
}

.bp-empty__text {
  max-width: 420px;
  margin: 8px 0 22px;
  color: var(--text-2);
  line-height: 1.5;
}

.bp-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 12px;
  border-bottom: 1px solid var(--line);
}

.bp-bar__select {
  flex: 1;
  max-width: 360px;
}

.bp-bar__tools {
  display: flex;
  gap: 2px;
  margin-left: auto;
}

.bp-rename {
  flex: 1;
  display: flex;
  gap: 8px;
}

.bp-rename > :first-child {
  flex: 1;
}

.bp-body,
.bp-run {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 16px 16px;
}

.bp-label {
  font-size: 11.5px;
  font-weight: 560;
  color: var(--text-3);
  margin-bottom: 6px;
}

.bp-source {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bp-source .bp-label {
  margin-bottom: -2px;
}

.bp-path {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 4px 0 12px;
  border-radius: var(--r);
  background: var(--panel-2);
  box-shadow: inset 0 0 0 1px var(--line-2);
}

.bp-path__icon {
  color: var(--accent);
}

.bp-path__text {
  flex: 1;
  font-size: 12px;
}

.bp-opts {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.bp-opts__switch {
  flex-direction: row-reverse;
  justify-content: flex-end;
  gap: 10px;
}

.bp-opts__types {
  margin-left: auto;
}

.bp-tree {
  flex: 1;
  min-height: 160px;
}

.bp-preview {
  padding: 10px 12px;
  border-radius: var(--r);
  background: var(--panel-2);
  box-shadow: inset 0 0 0 1px var(--line);
  font-size: 11.5px;
}

.bp-preview__row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  min-width: 0;
  line-height: 1.7;
}

.accent {
  color: var(--accent);
}

.faint {
  color: var(--text-3);
}

.good {
  color: var(--ok);
}

.bad {
  color: var(--err);
}

.bp-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 10px 10px 14px;
  border-radius: var(--r);
  background: var(--ok-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok) 25%, transparent);
}

.bp-summary.is-warn {
  background: var(--warn-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--warn) 25%, transparent);
}

.bp-summary__icon {
  color: var(--ok);
}

.is-warn .bp-summary__icon {
  color: var(--warn);
}

.bp-summary__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-2);
}

.bp-summary__text b {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}

.bp-summary__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.bp-run__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.bp-run__count b {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.bp-run__count span {
  color: var(--text-3);
  font-size: 14px;
}

.bp-run__pct {
  font-size: 15px;
  color: var(--text-2);
}

.bp-run__bar {
  height: 6px;
  border-radius: 4px;
  background: var(--panel-3);
  overflow: hidden;
  margin-top: -8px;
}

.bp-run__bar div {
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 220ms linear;
}

.bp-run__meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-2);
  margin-top: -8px;
}

.bp-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.bp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--r);
  background: var(--panel-2);
  box-shadow: inset 0 0 0 1px var(--line);
  font-size: 11.5px;
  color: var(--text-3);
}

.bp-stat__n {
  font-size: 17px;
  color: var(--text);
}

.bp-current__item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--text-2);
}

.bp-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 6px 10px 6px 16px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}

.bp-foot b {
  font-weight: 600;
}

.bp-foot__last {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bp-foot > :last-child {
  margin-left: auto;
}

.bp-foot__last + :last-child {
  margin-left: 0;
}

@media (max-width: 560px) {
  .bp-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .bp-opts__types {
    margin-left: 0;
  }
  .bp-foot__last {
    display: none;
  }
}
</style>
