<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="paths[name] || ''"
  />
</template>

<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  stroke: { type: [Number, String], default: 1.5 }
});

// Собственный набор в одной сетке 20×20.
const paths = {
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  minus: '<path d="M4.5 10h11"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  file: '<path d="M11.5 2.75H6.25a1.5 1.5 0 0 0-1.5 1.5v11.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V6.5z"/><path d="M11.5 2.75V6.5h3.75"/>',
  folder: '<path d="M2.75 5.75a1.5 1.5 0 0 1 1.5-1.5h3.1l1.6 1.75h6.8a1.5 1.5 0 0 1 1.5 1.5v7.25a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5z"/>',
  'folder-open': '<path d="M2.75 14.5V5.75a1.5 1.5 0 0 1 1.5-1.5h3.1l1.6 1.75h5.3a1.5 1.5 0 0 1 1.5 1.5v1"/><path d="M2.9 15.1l2.1-5.35a1.5 1.5 0 0 1 1.4-.95h9.9a1 1 0 0 1 .93 1.37l-1.9 4.8a1.5 1.5 0 0 1-1.4.95H4.25"/>',
  image: '<rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2"/><circle cx="7.25" cy="8" r="1.4"/><path d="M17.25 12.75l-3.9-3.9a1 1 0 0 0-1.42 0L4 16.25"/>',
  film: '<rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2"/><path d="M6.25 3.75v12.5M13.75 3.75v12.5M2.75 7.5h3.5M2.75 12.5h3.5M13.75 7.5h3.5M13.75 12.5h3.5"/>',
  music: '<path d="M7.75 14.25V4.9l8.5-1.65v9.35"/><circle cx="5.6" cy="14.4" r="2.15"/><circle cx="14.1" cy="12.75" r="2.15"/>',
  trash: '<path d="M3.75 5.75h12.5M8 5.75V4.25a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.25 5.75l.7 9.6a1.5 1.5 0 0 0 1.5 1.4h5.1a1.5 1.5 0 0 0 1.5-1.4l.7-9.6"/>',
  crop: '<path d="M5.5 2.5v10.25a1.75 1.75 0 0 0 1.75 1.75H17.5"/><path d="M2.5 5.5h10.25a1.75 1.75 0 0 1 1.75 1.75V17.5"/>',
  eye: '<path d="M2.25 10s2.75-5.25 7.75-5.25S17.75 10 17.75 10 15 15.25 10 15.25 2.25 10 2.25 10z"/><circle cx="10" cy="10" r="2.25"/>',
  compare: '<rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2"/><path d="M10 2v16"/><path d="M5.5 11.5l1.75-2 1.5 1.5M12.25 8h2.5"/>',
  reveal: '<path d="M9.25 3.75h-4.5a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h9.5a2 2 0 0 0 2-2v-4.5"/><path d="M12.25 2.75h5v5M17 3l-7.25 7.25"/>',
  alert: '<circle cx="10" cy="10" r="7.25"/><path d="M10 6.25v4.5M10 13.5v.25"/>',
  info: '<circle cx="10" cy="10" r="7.25"/><path d="M10 9v4.75M10 6.5v.25"/>',
  skip: '<circle cx="10" cy="10" r="7.25"/><path d="M5 15l10-10"/>',
  'rotate-left': '<path d="M3.75 8.25a6.5 6.5 0 1 1 1.4 5.6"/><path d="M3.25 3.75v4.75H8"/>',
  'rotate-right': '<path d="M16.25 8.25a6.5 6.5 0 1 0-1.4 5.6"/><path d="M16.75 3.75v4.75H12"/>',
  'flip-h': '<path d="M10 2.75v14.5" stroke-dasharray="1.5 2.25"/><path d="M7.25 5.25L2.75 14.75h4.5zM12.75 5.25l4.5 9.5h-4.5z"/>',
  'flip-v': '<path d="M2.75 10h14.5" stroke-dasharray="1.5 2.25"/><path d="M5.25 7.25l9.5-4.5v4.5zM5.25 12.75l9.5 4.5v-4.5z"/>',
  'chevron-down': '<path d="M5.5 8l4.5 4.5L14.5 8"/>',
  'chevron-right': '<path d="M8 5.5l4.5 4.5L8 14.5"/>',
  'chevron-left': '<path d="M12 5.5L7.5 10l4.5 4.5"/>',
  search: '<circle cx="8.75" cy="8.75" r="5.25"/><path d="M12.75 12.75l4 4"/>',
  sliders: '<path d="M3.5 6h7M14.5 6h2M3.5 14h2M9.5 14h7"/><circle cx="12.5" cy="6" r="2"/><circle cx="7.5" cy="14" r="2"/>',
  arrow: '<path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5"/>',
  stop: '<rect x="5" y="5" width="10" height="10" rx="1.5"/>',
  minimize: '<path d="M5 10h10"/>',
  maximize: '<rect x="5" y="5" width="10" height="10" rx="1"/>',
  restore: '<rect x="4.5" y="7" width="8.5" height="8.5" rx="1"/><path d="M7 7V5.5a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H13"/>',
  clipboard: '<rect x="4.25" y="3.75" width="11.5" height="13.5" rx="1.75"/><path d="M7.5 3.75v-.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v.5M7.25 9h5.5M7.25 12.25h3.5"/>',
  save: '<path d="M4.25 2.75h9.1l3.9 3.9v9.1a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5V4.25a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M6.25 2.75v4h6v-4M6.25 17.25v-5h7.5v5"/>',
  sun: '<circle cx="10" cy="10" r="3.25"/><path d="M10 2.25v1.5M10 16.25v1.5M2.25 10h1.5M16.25 10h1.5M4.5 4.5l1.06 1.06M14.44 14.44l1.06 1.06M4.5 15.5l1.06-1.06M14.44 5.56l1.06-1.06"/>',
  moon: '<path d="M16.5 12.2A6.75 6.75 0 0 1 7.8 3.5a6.75 6.75 0 1 0 8.7 8.7z"/>',
  monitor: '<rect x="2.75" y="3.75" width="14.5" height="10" rx="1.75"/><path d="M7 17.25h6M10 13.75v3.5"/>',
  refresh: '<path d="M16.25 10a6.25 6.25 0 0 1-11.1 3.94M3.75 10a6.25 6.25 0 0 1 11.1-3.94"/><path d="M15.25 2.75v3.5h-3.5M4.75 17.25v-3.5h3.5"/>',
  reset: '<path d="M3.75 10a6.25 6.25 0 1 0 1.83-4.42L3.75 7.5"/><path d="M3.75 3.75V7.5H7.5"/>',
  lock: '<rect x="4.25" y="8.75" width="11.5" height="8.5" rx="1.75"/><path d="M6.75 8.75V6.5a3.25 3.25 0 0 1 6.5 0v2.25"/>',
  unlock: '<rect x="4.25" y="8.75" width="11.5" height="8.5" rx="1.75"/><path d="M6.75 8.75V6.5a3.25 3.25 0 0 1 6.25-1.25"/>',
  more: '<circle cx="4.75" cy="10" r=".6" fill="currentColor"/><circle cx="10" cy="10" r=".6" fill="currentColor"/><circle cx="15.25" cy="10" r=".6" fill="currentColor"/>',
  layers: '<path d="M10 2.75l7.25 3.75L10 10.25 2.75 6.5z"/><path d="M2.75 10L10 13.75 17.25 10M2.75 13.5L10 17.25l7.25-3.75"/>',
  scan: '<path d="M2.75 6.5V4.25a1.5 1.5 0 0 1 1.5-1.5H6.5M13.5 2.75h2.25a1.5 1.5 0 0 1 1.5 1.5V6.5M17.25 13.5v2.25a1.5 1.5 0 0 1-1.5 1.5H13.5M6.5 17.25H4.25a1.5 1.5 0 0 1-1.5-1.5V13.5"/>',
  grid: '<rect x="2.75" y="2.75" width="14.5" height="14.5" rx="1.5"/><path d="M7.6 2.75v14.5M12.4 2.75v14.5M2.75 7.6h14.5M2.75 12.4h14.5"/>',
  keyboard: '<rect x="2.25" y="5" width="15.5" height="10" rx="1.75"/><path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M6.5 12h7"/>'
};
</script>

<style scoped>
.icon {
  flex: none;
  display: block;
}
</style>
