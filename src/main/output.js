// src/main/output.js
// Куда и под каким именем сохранять результат.
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WIN = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

function pad(n) {
  return String(n).padStart(2, '0');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Нужны ли для имени размеры результата — тогда имя известно только после кодирования. */
function templateNeedsSize(template) {
  return /\{(w|h)\}/.test(template || '');
}

function renderName(template, vars) {
  let tpl = String(template || '').trim() || '{name}';
  // У аудио нет размеров: «{name}-{w}x{h}» должно превратиться в «{name}», а не в «{name}-x».
  if (!vars.w || !vars.h) tpl = tpl.replace(/[-_ .]*\{w\}x\{h\}/g, '');
  let name = tpl.replace(/\{(name|w|h|suffix|n|date|fmt)\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
  // Суффикс варианта обязателен, иначе @1x и @2x затрут друг друга.
  if (vars.suffix && !tpl.includes('{suffix}')) name += vars.suffix;
  name = name.replace(ILLEGAL, '_').replace(/[. ]+$/, '').trim();
  if (!name || RESERVED_WIN.test(name)) name = `${vars.name || 'file'}${vars.suffix || ''}`;
  return name;
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Папка назначения для файла. */
function resolveOutputDir(item, output) {
  const srcDir = path.dirname(item.path);
  const root = item.baseDir && isInside(srcDir, item.baseDir) ? item.baseDir : null;
  const rel = output.preserveStructure && root ? path.relative(root, srcDir) : '';

  switch (output.location) {
    case 'subdir': {
      const sub = String(output.subDir || 'converted').replace(/[<>:"|?*]/g, '_');
      // Файлы из импортированной папки собираются в одну подпапку в её корне:
      // со структурой вложенных папок или плоско.
      return root ? path.join(root, sub, rel) : path.join(srcDir, sub);
    }
    case 'custom': {
      const custom = String(output.customDir || '').trim();
      if (!custom) throw new Error('Не выбрана папка для сохранения');
      const base = path.isAbsolute(custom) ? custom : path.resolve(root || srcDir, custom);
      return path.join(base, rel);
    }
    default:
      return srcDir;
  }
}

/**
 * Резерватор путей на время пакета: не даёт двум заданиям выбрать одно имя.
 */
class PathReserver {
  constructor() {
    this.reserved = new Set();
  }

  key(p) {
    return process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p;
  }

  taken(p) {
    return this.reserved.has(this.key(p)) || fs.existsSync(p);
  }

  /**
   * Возвращает путь для записи или null, если по политике файл надо пропустить.
   * policy: rename | overwrite | skip | newer (перезаписать, только если исходник новее результата).
   */
  claim(dir, baseName, ext, policy, sourceMtime = 0) {
    const first = path.join(dir, `${baseName}.${ext}`);
    const k = this.key(first);
    const reserved = this.reserved.has(k);
    let exists = false;
    let outMtime = 0;
    if (!reserved) {
      try {
        outMtime = fs.statSync(first).mtimeMs;
        exists = true;
      } catch {
        exists = false;
      }
    }
    if (!reserved && !exists) {
      this.reserved.add(k);
      return first;
    }
    if (policy === 'skip') return null;
    if (policy === 'newer' && !reserved) {
      // Секундный допуск: FAT/exFAT и сетевые диски хранят время с округлением.
      if (outMtime + 1000 >= sourceMtime) return null;
      this.reserved.add(k);
      return first;
    }
    if (policy === 'overwrite' && !reserved) {
      this.reserved.add(k);
      return first;
    }
    for (let i = 1; i < 100000; i++) {
      const candidate = path.join(dir, `${baseName}_${i}.${ext}`);
      if (!this.taken(candidate)) {
        this.reserved.add(this.key(candidate));
        return candidate;
      }
    }
    throw new Error('Не удалось подобрать свободное имя файла');
  }

  release(p) {
    if (p) this.reserved.delete(this.key(p));
  }
}

/** Временный файл рядом с итоговым: пишем туда, затем атомарно переименовываем. */
function tempPathFor(dir, ext) {
  return path.join(dir, `.hzconv-${crypto.randomBytes(5).toString('hex')}.part.${ext}`);
}

async function commitTemp(tempPath, finalPath) {
  try {
    await fs.move(tempPath, finalPath, { overwrite: true });
  } catch (error) {
    await fs.remove(tempPath).catch(() => {});
    throw error;
  }
}

module.exports = { renderName, resolveOutputDir, templateNeedsSize, PathReserver, tempPathFor, commitTemp, today, isInside };
