import { reactive } from 'vue';

export const toasts = reactive([]);
let seq = 0;

/**
 * kind: info | ok | error | warn. Одинаковые сообщения не дублируются, а продлеваются.
 */
export function toast(text, { kind = 'info', timeout = 3800, action = null } = {}) {
  const same = toasts.find((t) => t.text === text && t.kind === kind);
  if (same) {
    clearTimeout(same.timer);
    same.timer = setTimeout(() => dismiss(same.id), timeout);
    return same.id;
  }
  const id = ++seq;
  const t = { id, text, kind, action, timer: null };
  t.timer = setTimeout(() => dismiss(id), timeout);
  toasts.push(t);
  if (toasts.length > 4) dismiss(toasts[0].id);
  return id;
}

export function dismiss(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) {
    clearTimeout(toasts[i].timer);
    toasts.splice(i, 1);
  }
}
