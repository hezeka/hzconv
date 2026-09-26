// src/main/utils/fileManager.js
// Обход папок: список подпапок и поиск поддерживаемых файлов.
const fs = require('fs-extra');
const path = require('path');
const { getFileType, extOf } = require('../formats');

const SKIP_DIRS = new Set(['node_modules', '$recycle.bin', 'system volume information', '__macosx']);

function shouldSkipDir(name, exclude) {
  if (name.startsWith('.')) return true;
  const lower = name.toLowerCase();
  return SKIP_DIRS.has(lower) || exclude.has(lower);
}

class FileManager {
  /**
   * Список подпапок (для выбора, что конвертировать).
   * @returns {Promise<Array<{path, name, relativePath, depth, fileCount}>>}
   */
  static async getSubfolders(dirPath, { recursive = true, exclude = [] } = {}) {
    const skip = new Set(exclude.map((e) => String(e).toLowerCase()));
    const result = [];

    const walk = async (dir, depth) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      const dirs = entries.filter((e) => e.isDirectory() && !shouldSkipDir(e.name, skip)).sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
      // Подсчёт файлов во всех подпапках уровня — параллельно.
      const counts = await Promise.all(
        dirs.map(async (d) => {
          try {
            const inner = await fs.readdir(path.join(dir, d.name), { withFileTypes: true });
            return inner.filter((e) => e.isFile() && getFileType(e.name)).length;
          } catch {
            return 0;
          }
        })
      );
      for (let i = 0; i < dirs.length; i++) {
        const full = path.join(dir, dirs[i].name);
        result.push({ path: full, name: dirs[i].name, relativePath: path.relative(dirPath, full), depth, fileCount: counts[i] });
        if (recursive) await walk(full, depth + 1);
      }
    };

    await walk(dirPath, 0);
    return result;
  }

  /**
   * Поддерживаемые файлы в папке.
   * formats — фильтр расширений (пустой = все поддерживаемые),
   * subfolders — выбранные подпапки (пустой = все; сам dirPath означает «файлы в корне»).
   */
  static async getFilesFromDirectory(dirPath, { formats = [], recursive = false, subfolders = [], exclude = [] } = {}) {
    const skip = new Set(exclude.map((e) => String(e).toLowerCase()));
    const allow = new Set(formats.map((f) => String(f).toLowerCase().replace(/^\./, '')));
    const selected = subfolders.map((p) => path.resolve(p));
    const hasFilter = selected.length > 0;
    const result = [];

    const dirSelected = (dir) => selected.some((s) => (s === path.resolve(dirPath) ? dir === s : dir === s || dir.startsWith(s + path.sep)));
    const dirOnTheWay = (dir) => selected.some((s) => s.startsWith(dir + path.sep));

    const walk = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // нет доступа — пропускаем
      }
      const takeFiles = !hasFilter || dirSelected(dir);
      const subdirs = [];
      for (const e of entries) {
        if (e.isFile()) {
          if (!takeFiles || e.name.startsWith('.')) continue;
          if (!getFileType(e.name)) continue;
          if (allow.size && !allow.has(extOf(e.name))) continue;
          result.push(path.join(dir, e.name));
        } else if (e.isDirectory() && recursive && !shouldSkipDir(e.name, skip)) {
          const full = path.join(dir, e.name);
          if (!hasFilter || dirSelected(full) || dirOnTheWay(full)) subdirs.push(full);
        }
      }
      for (const d of subdirs) await walk(d);
    };

    await walk(path.resolve(dirPath));
    return result.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }

  /**
   * Разворачивает набор путей (файлы и папки, например после drag & drop)
   * в список файлов. Для файлов из папок запоминаем корень — он нужен для сохранения структуры.
   */
  static async expandPaths(paths, { recursive = true, exclude = [] } = {}) {
    const out = [];
    for (const p of paths) {
      let stat;
      try {
        stat = await fs.stat(p);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        const files = await FileManager.getFilesFromDirectory(p, { recursive, exclude });
        for (const f of files) out.push({ path: f, baseDir: p });
      } else if (stat.isFile()) {
        out.push({ path: p, baseDir: null });
      }
    }
    return out;
  }
}

module.exports = FileManager;
