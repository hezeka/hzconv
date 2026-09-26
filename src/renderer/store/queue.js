import { computed, reactive } from 'vue';
import { api, errorText } from '../api';
import { settings } from './settings';
import { toast } from './toast';
import { files, formatBytes, formatDelta } from '../utils/format';

export const queue = reactive({
  items: [],
  selectedId: null,
  running: false,
  summary: null,
  filter: 'all',
  runIds: []
});

const byPath = new Map();
const byId = new Map();
let seq = 0;

const pathKey = (p) => (/^[a-z]:\\/i.test(p) ? p.toLowerCase() : p);

export const counts = computed(() => {
  const c = { all: queue.items.length, image: 0, video: 0, audio: 0, done: 0, error: 0, bytes: 0 };
  for (const it of queue.items) {
    c[it.type]++;
    c.bytes += it.size || 0;
    if (it.status === 'done') c.done++;
    if (it.status === 'error') c.error++;
  }
  return c;
});

export const visibleItems = computed(() => (queue.filter === 'all' ? queue.items : queue.items.filter((it) => it.type === queue.filter)));

export const selectedItem = computed(() => (queue.selectedId ? byId.get(queue.selectedId) || null : null));

export const progress = computed(() => {
  if (!queue.running) return 0;
  const ids = new Set(queue.runIds);
  const active = queue.items.filter((it) => ids.has(it.id));
  if (!active.length) return 0;
  const sum = active.reduce((acc, it) => acc + (['done', 'error', 'skipped', 'cancelled'].includes(it.status) ? 1 : it.progress || 0), 0);
  return sum / active.length;
});

function excludeDirs() {
  return settings.output.location === 'subdir' && settings.output.subDir ? [settings.output.subDir] : [];
}

/** entries: [{ path, baseDir }] */
export async function addEntries(entries, { quiet = false } = {}) {
  const seen = new Set();
  const fresh = entries.filter((e) => {
    const k = pathKey(e.path);
    if (byPath.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!fresh.length) {
    if (!quiet && entries.length) toast('Эти файлы уже в очереди');
    return 0;
  }

  const infos = await api.inspect(fresh.map((e) => e.path));
  let added = 0;
  let unsupported = 0;
  infos.forEach((info, i) => {
    if (!info.ok) {
      unsupported++;
      return;
    }
    const item = {
      id: `f${++seq}`,
      path: info.path,
      baseDir: fresh[i].baseDir || null,
      name: info.name,
      ext: info.ext,
      type: info.type,
      size: info.size,
      details: null,
      detailsState: 'idle',
      edit: null,
      status: 'idle',
      progress: 0,
      error: null,
      outputs: null,
      outputSize: null,
      elapsed: null
    };
    queue.items.push(item);
    const reactiveItem = queue.items[queue.items.length - 1];
    byPath.set(pathKey(info.path), reactiveItem);
    byId.set(item.id, reactiveItem);
    added++;
  });

  if (added) queue.summary = null;
  if (!quiet) {
    if (added && unsupported) toast(`Добавлено: ${files(added)}. Пропущено неподдерживаемых: ${unsupported}`);
    else if (added) toast(`Добавлено: ${files(added)}`, { kind: 'ok' });
    else if (unsupported) toast(unsupported === 1 ? 'Этот формат не поддерживается' : `Форматы не поддерживаются (${unsupported})`, { kind: 'warn' });
  }
  return added;
}

export async function addPaths(paths, { recursive = true, quiet = false } = {}) {
  if (!paths?.length) return 0;
  try {
    const entries = await api.expandPaths({ paths, recursive, exclude: excludeDirs() });
    if (!entries.length) {
      if (!quiet) toast('Подходящих файлов не найдено', { kind: 'warn' });
      return 0;
    }
    return await addEntries(entries, { quiet });
  } catch (e) {
    toast(`Не удалось добавить файлы: ${errorText(e)}`, { kind: 'error' });
    return 0;
  }
}

export async function loadDetails(item) {
  if (item.detailsState !== 'idle') return;
  item.detailsState = 'loading';
  try {
    item.details = await api.details(item.path);
    item.detailsState = 'ready';
  } catch (e) {
    item.detailsState = 'error';
    item.detailsError = errorText(e);
  }
}

export function removeItem(id) {
  const i = queue.items.findIndex((it) => it.id === id);
  if (i === -1) return;
  const [it] = queue.items.splice(i, 1);
  byPath.delete(pathKey(it.path));
  byId.delete(id);
  if (queue.selectedId === id) queue.selectedId = queue.items[i]?.id || queue.items[i - 1]?.id || null;
}

export function clearQueue() {
  queue.items.splice(0);
  byPath.clear();
  byId.clear();
  queue.selectedId = null;
  queue.summary = null;
}

export function removeFinished() {
  for (const it of [...queue.items]) if (it.status === 'done') removeItem(it.id);
  queue.summary = null;
}

export function getItem(id) {
  return byId.get(id) || null;
}

export function setEdit(id, edit) {
  const it = byId.get(id);
  if (!it) return;
  const empty = !edit || (!edit.rotate && !edit.flipH && !edit.flipV && !edit.crop);
  it.edit = empty ? null : { ...edit };
}

function applyEvent(e) {
  const it = byId.get(e.id);
  if (!it) return;
  it.status = e.status;
  if (e.progress !== undefined) it.progress = e.progress;
  if (e.status === 'error') it.error = e.error;
  if (e.status === 'skipped') it.error = e.reason || null;
  if (e.outputs) it.outputs = e.outputs;
  if (e.outputSize !== undefined) it.outputSize = e.outputSize;
  if (e.elapsed !== undefined) it.elapsed = e.elapsed;
}

/** ids — подмножество (например, повтор неудачных); по умолчанию вся очередь. */
export async function startConversion(ids = null) {
  if (queue.running) return;
  const list = ids ? queue.items.filter((it) => ids.includes(it.id)) : [...queue.items];
  if (!list.length) {
    toast('Добавьте файлы в очередь', { kind: 'warn' });
    return;
  }
  if (settings.output.location === 'custom' && !settings.output.customDir.trim()) {
    toast('Укажите папку в блоке «Сохранение»', { kind: 'warn' });
    return;
  }

  for (const it of queue.items) {
    if (!list.includes(it)) continue;
    Object.assign(it, { status: 'queued', progress: 0, error: null, outputs: null, outputSize: null, elapsed: null });
  }
  queue.running = true;
  queue.summary = null;
  queue.runIds = list.map((it) => it.id);

  const offProgress = api.onProgress((batch) => {
    for (const { id, progress: p } of batch) {
      const it = byId.get(id);
      if (it && it.status === 'processing') it.progress = p;
    }
  });
  const offItem = api.onItem(applyEvent);

  try {
    const summary = await api.convert({
      items: list.map((it) => ({ id: it.id, path: it.path, baseDir: it.baseDir, edit: it.edit })),
      settings
    });
    (summary.items || []).forEach(applyEvent);
    queue.summary = summary;
    announce(summary);
  } catch (e) {
    toast(errorText(e), { kind: 'error', timeout: 6000 });
  } finally {
    offProgress();
    offItem();
    for (const it of queue.items) if (it.status === 'queued' || it.status === 'processing') it.status = 'idle';
    queue.running = false;
  }
}

function announce(s) {
  if (s.wasCancelled) {
    toast(`Остановлено. Готово: ${s.done} из ${s.total}`, { kind: 'warn' });
    return;
  }
  const parts = [];
  if (s.done) parts.push(`Готово: ${files(s.done)}`);
  if (s.skipped) parts.push(`пропущено: ${s.skipped}`);
  if (s.failed) parts.push(`ошибок: ${s.failed}`);
  const saved = s.inputBytes && s.outputBytes < s.inputBytes ? ` · ${formatBytes(s.inputBytes - s.outputBytes)} сэкономлено (${formatDelta(s.inputBytes, s.outputBytes)})` : '';
  toast(parts.join(', ') + saved, { kind: s.failed ? (s.done ? 'warn' : 'error') : 'ok', timeout: 5200 });
}

export function cancelConversion() {
  if (queue.running) api.cancel();
}

export function retryFailed() {
  const ids = queue.items.filter((it) => it.status === 'error' || it.status === 'cancelled').map((it) => it.id);
  if (ids.length) startConversion(ids);
}
