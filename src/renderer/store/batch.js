import { computed, reactive, watch } from 'vue';
import defaults from '../../shared/defaults.json';
import { api, errorText } from '../api';
import { settings, bindProfile, bindSingle, legacyToSettings, mergeDefaults } from './settings';
import { ui } from './ui';
import { toast } from './toast';
import { basename, files, formatBytes, formatDelta } from '../utils/format';

const KEY = 'hzconv.jobs.v1';
const LEGACY_KEY = 'directoryConversion_settings';

const clone = (v) => JSON.parse(JSON.stringify(v));

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const newId = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function newSource(dir = '') {
  return { dir, recursive: true, types: 'all', extensions: '', excluded: [] };
}

// Для регулярных заданий по умолчанию пересчитываются только изменившиеся файлы.
function newJobSettings() {
  const s = clone(defaults);
  s.output.conflict = 'newer';
  s.output.preserveStructure = true;
  return s;
}

function normalizeJob(j) {
  return {
    id: j.id || newId(),
    name: String(j.name || 'Задание'),
    source: { ...newSource(), ...(j.source || {}), excluded: Array.isArray(j.source?.excluded) ? j.source.excluded : [] },
    settings: mergeDefaults(defaults, j.settings),
    lastRun: j.lastRun || null
  };
}

// Пакетная форма прошлой версии превращается в первое задание.
function migrateLegacy() {
  const legacy = read(LEGACY_KEY);
  if (!legacy || !legacy.dirPath) return [];
  localStorage.removeItem(LEGACY_KEY);
  const s = legacyToSettings(legacy);
  const source = newSource(legacy.dirPath);
  source.recursive = legacy.recursive !== false;
  source.extensions = legacy.formatFilter || '';
  return [normalizeJob({ name: basename(legacy.dirPath) || 'Моя папка', source, settings: s })];
}

const stored = read(KEY);
const initialJobs = (stored?.jobs || []).map(normalizeJob);
if (!initialJobs.length) initialJobs.push(...migrateLegacy());

export const batch = reactive({
  jobs: initialJobs,
  activeId: stored?.activeId && initialJobs.some((j) => j.id === stored.activeId) ? stored.activeId : initialJobs[0]?.id || null,
  folders: [],
  foldersLoading: false,
  stats: null,
  scanning: false,
  scanError: '',
  preview: null,
  running: false,
  progress: null,
  summary: null,
  errors: []
});

export const activeJob = computed(() => batch.jobs.find((j) => j.id === batch.activeId) || null);

let saveTimer = null;
watch(
  () => [batch.jobs, batch.activeId],
  () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ jobs: batch.jobs, activeId: batch.activeId }));
      } catch {
        /* не критично */
      }
    }, 250);
  },
  { deep: true }
);

// ——— Профиль настроек: штучный режим или активное задание ———
watch(
  () => [ui.mode, batch.activeId],
  () => {
    const job = activeJob.value;
    if (ui.mode === 'batch' && job) {
      bindProfile(clone(job.settings), (data) => {
        job.settings = data;
      });
    } else {
      bindSingle();
    }
  },
  { immediate: true }
);

// ——— Управление заданиями ———

export async function createJob(presetDir = null) {
  const dir = presetDir || (await api.openFolder({ title: 'Папка для пакетной обработки' }));
  if (!dir) return null;
  const existing = batch.jobs.find((j) => j.source.dir === dir);
  if (existing) {
    batch.activeId = existing.id;
    return existing;
  }
  const job = normalizeJob({ name: basename(dir) || 'Задание', source: newSource(dir), settings: newJobSettings() });
  batch.jobs.push(job);
  batch.activeId = job.id;
  batch.summary = null;
  return job;
}

export function duplicateJob() {
  const job = activeJob.value;
  if (!job) return;
  const copy = normalizeJob({ ...clone(job), id: newId(), name: `${job.name} (копия)`, lastRun: null });
  batch.jobs.push(copy);
  batch.activeId = copy.id;
}

export function deleteJob(id) {
  const i = batch.jobs.findIndex((j) => j.id === id);
  if (i === -1) return;
  batch.jobs.splice(i, 1);
  if (batch.activeId === id) batch.activeId = batch.jobs[Math.max(0, i - 1)]?.id || null;
  batch.summary = null;
}

export async function changeJobDir() {
  const job = activeJob.value;
  if (!job) return;
  const dir = await api.openFolder({ title: 'Папка для пакетной обработки', defaultPath: job.source.dir || undefined });
  if (!dir || dir === job.source.dir) return;
  job.source.dir = dir;
  job.source.excluded = [];
}

// ——— Сканирование: список подпапок, статистика и пример пути ———

async function loadFolders() {
  const job = activeJob.value;
  batch.folders = [];
  if (!job?.source.dir || !job.source.recursive) return;
  const dir = job.source.dir;
  batch.foldersLoading = true;
  try {
    const exclude = settings.output.location === 'subdir' && settings.output.subDir ? [settings.output.subDir] : [];
    const list = await api.getSubfolders({ dir, exclude });
    if (activeJob.value?.source.dir === dir) batch.folders = list;
  } catch (e) {
    batch.scanError = errorText(e);
  } finally {
    batch.foldersLoading = false;
  }
}

let scanSeq = 0;
let scanTimer = null;

export async function rescan() {
  const job = activeJob.value;
  if (!job?.source.dir) {
    batch.stats = null;
    batch.preview = null;
    return;
  }
  const my = ++scanSeq;
  batch.scanning = true;
  batch.scanError = '';
  try {
    const stats = await api.batchScan({ source: job.source, settings });
    if (my !== scanSeq) return;
    batch.stats = stats;
    batch.preview = stats.sample ? await api.previewOutput({ path: stats.sample, baseDir: job.source.dir, settings }) : null;
  } catch (e) {
    if (my !== scanSeq) return;
    batch.stats = null;
    batch.preview = null;
    batch.scanError = errorText(e);
  } finally {
    if (my === scanSeq) batch.scanning = false;
  }
}

function scheduleScan(delay = 300) {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(rescan, delay);
}

watch(
  () => (ui.mode === 'batch' ? [activeJob.value?.id, activeJob.value?.source.dir, activeJob.value?.source.recursive] : null),
  (v) => {
    if (!v) return;
    loadFolders();
    scheduleScan(0);
  },
  { immediate: true }
);

watch(
  () => (ui.mode === 'batch' && activeJob.value ? JSON.stringify([activeJob.value.source, settings.output, settings.image.format, settings.video.format, settings.audio.format]) : null),
  (v, old) => {
    if (v && old) scheduleScan();
  }
);

// ——— Запуск ———

export async function runJob({ onlyPaths = null } = {}) {
  const job = activeJob.value;
  if (!job || batch.running) return;
  if (!job.source.dir) {
    toast('Выберите папку задания', { kind: 'warn' });
    return;
  }
  if (settings.output.location === 'custom' && !settings.output.customDir.trim()) {
    toast('Укажите папку для сохранения во вкладке «Сохранение»', { kind: 'warn' });
    return;
  }
  batch.running = true;
  batch.summary = null;
  batch.errors = [];
  batch.progress = { total: batch.stats?.count || 0, done: 0, failed: 0, skipped: 0, cancelled: 0, bytesIn: 0, bytesOut: 0, elapsed: 0, current: [] };

  const off = api.onBatchProgress((p) => {
    batch.progress = p;
    if (p.errors?.length) batch.errors.push(...p.errors);
  });
  try {
    const summary = await api.batchStart({ source: job.source, settings, onlyPaths });
    batch.summary = summary;
    batch.errors = summary.errors;
    job.lastRun = { at: Date.now(), done: summary.done, failed: summary.failed, skipped: summary.skipped, total: summary.total };
    announce(summary);
  } catch (e) {
    toast(errorText(e), { kind: 'error', timeout: 6000 });
  } finally {
    off();
    batch.running = false;
    batch.progress = null;
  }
}

function announce(s) {
  if (s.wasCancelled) {
    toast(`Остановлено. Обработано: ${s.done} из ${s.total}`, { kind: 'warn' });
    return;
  }
  if (!s.done && !s.failed && s.skipped) {
    toast(`Всё уже актуально: ${files(s.skipped)} без изменений`, { kind: 'ok' });
    return;
  }
  const parts = [`Готово: ${files(s.done)}`];
  if (s.skipped) parts.push(`без изменений: ${s.skipped}`);
  if (s.failed) parts.push(`ошибок: ${s.failed}`);
  const saved = s.bytesIn && s.bytesOut < s.bytesIn ? ` · ${formatBytes(s.bytesIn - s.bytesOut)} сэкономлено (${formatDelta(s.bytesIn, s.bytesOut)})` : '';
  toast(parts.join(', ') + saved, { kind: s.failed ? 'warn' : 'ok', timeout: 5200 });
}

export function retryErrors() {
  const paths = batch.errors.map((e) => e.path);
  if (paths.length) runJob({ onlyPaths: paths });
}
