import { api, errorText } from '../api';
import { addEntries, addPaths } from '../store/queue';
import { ui } from '../store/ui';
import { toast } from '../store/toast';

export function useAddActions() {
  async function addFiles() {
    try {
      const paths = await api.openFiles();
      if (paths.length) await addPaths(paths, { recursive: false });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  }

  // Папка открывается в диалоге выбора подпапок и фильтров.
  async function addFolder() {
    try {
      const dir = await api.openFolder({ title: 'Добавить папку' });
      if (dir) ui.folderImport = dir;
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  }

  async function pasteFromClipboard() {
    try {
      const file = await api.pasteImage();
      if (!file) {
        toast('В буфере обмена нет изображения');
        return;
      }
      const added = await addEntries([{ path: file, baseDir: null }], { quiet: true });
      if (added) toast('Изображение из буфера сохранено в «Изображения/Hzconv» и добавлено', { kind: 'ok' });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  }

  return { addFiles, addFolder, pasteFromClipboard };
}
