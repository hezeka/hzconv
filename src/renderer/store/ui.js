import { reactive, watch } from 'vue';
import { api } from '../api';

const KEY = 'hzconv.ui.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const saved = load();

export const ui = reactive({
  theme: ['system', 'light', 'dark'].includes(saved.theme) ? saved.theme : 'system',
  tab: saved.tab || 'image',
  mode: saved.mode === 'batch' ? 'batch' : 'files',
  compact: false,
  narrow: false,
  settingsOpen: false,
  folderRecursive: saved.folderRecursive !== false,
  // Модальные окна
  cropId: null,
  previewId: null,
  folderImport: null, // путь выбранной папки
  presetDialog: false,
  shortcuts: false,
  dragging: false
});

export function applyTheme() {
  const root = document.documentElement;
  if (ui.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', ui.theme);
  api.setTheme(ui.theme).catch(() => {});
}

watch(
  () => [ui.theme, ui.tab, ui.folderRecursive, ui.mode],
  () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme: ui.theme, tab: ui.tab, folderRecursive: ui.folderRecursive, mode: ui.mode }));
    } catch {
      /* не критично */
    }
  }
);

watch(() => ui.theme, applyTheme);

// Компактная раскладка: настройки уходят в выдвижную панель.
function measure() {
  ui.compact = window.innerWidth < 860;
  ui.narrow = window.innerWidth < 560;
  if (!ui.compact) ui.settingsOpen = false;
}
measure();
window.addEventListener('resize', measure);
