const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? nf0.format(v) : nf1.format(v)} ${units[i]}`;
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function formatElapsed(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} мс`;
  if (ms < 60000) return `${nf1.format(ms / 1000)} с`;
  return formatDuration(ms / 1000);
}

export function formatDims(w, h) {
  return w && h ? `${w} × ${h}` : '';
}

/** Экономия в процентах: −82% (меньше) или +15% (больше). */
export function formatDelta(input, output) {
  if (!input || !Number.isFinite(output)) return '';
  const d = Math.round(((output - input) / input) * 100);
  if (d === 0) return '±0%';
  return d < 0 ? `−${Math.abs(d)}%` : `+${d}%`;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function files(n) {
  return `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;
}

export function basename(p) {
  return String(p || '').split(/[\\/]/).pop();
}

export function dirname(p) {
  const parts = String(p || '').split(/[\\/]/);
  parts.pop();
  return parts.join(p.includes('\\') ? '\\' : '/');
}

/** Сокращает путь по середине: C:\Users\…\Projects\site. */
export function shortPath(p, max = 48) {
  const s = String(p || '');
  if (s.length <= max) return s;
  const sep = s.includes('\\') ? '\\' : '/';
  const parts = s.split(sep);
  const tail = parts.slice(-2).join(sep);
  const head = parts.slice(0, 2).join(sep);
  const out = `${head}${sep}…${sep}${tail}`;
  return out.length <= max + 6 ? out : `…${s.slice(-max)}`;
}
