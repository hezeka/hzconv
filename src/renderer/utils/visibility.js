// Общий IntersectionObserver: превью строк грузятся, только когда строка видна.
const callbacks = new WeakMap();
let observer = null;

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const cb = callbacks.get(e.target);
          if (cb) {
            cb();
            observer.unobserve(e.target);
            callbacks.delete(e.target);
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
  }
  return observer;
}

export function observeVisible(el, cb) {
  if (!el) return () => {};
  callbacks.set(el, cb);
  getObserver().observe(el);
  return () => {
    callbacks.delete(el);
    observer?.unobserve(el);
  };
}
