/** «90», «1:30», «01:02:03.5» → секунды. Пустая строка → null. Та же логика, что в main. */
export function parseTime(value) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!s) return null;
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s)) throw new Error(`Неверное время «${s}». Пример: 90 или 1:30`);
  return s.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
}
