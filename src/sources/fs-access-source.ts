import { DmsError, guessMimeType, type DmsFile, type DmsFolder, type DocumentSource } from '../core';

/** Ids are paths relative to the picked folder: `''` is the root, `'RFPs/2026'` a sub-folder, `'RFPs/a.pdf'` a file. */
const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);
const split = (id: string): { dir: string; name: string } => {
  const i = id.lastIndexOf('/');
  return i < 0 ? { dir: '', name: id } : { dir: id.slice(0, i), name: id.slice(i + 1) };
};

/**
 * A `folder_source` over a real directory, via the browser's File System Access API (Chrome and Edge, secure
 * contexts incl. `file://`). The user picks the folder with `pickLocalFolder()`; nothing is uploaded anywhere.
 * Full read/write: new folders, upload, rename, delete (delete is permanent: the browser has no recycle bin).
 */
export class FsAccessSource implements DocumentSource {
  readonly kind = 'folder_source' as const;
  readonly readOnly = false;
  readonly label: string;

  constructor(private readonly root: FileSystemDirectoryHandle) {
    this.label = root.name;
  }

  async listFolders(): Promise<DmsFolder[]> {
    const out: DmsFolder[] = [{ id: '', name: this.root.name, parentId: null }];
    const walk = async (dir: FileSystemDirectoryHandle, path: string): Promise<void> => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== 'directory' || name.startsWith('.')) continue;
        const id = join(path, name);
        out.push({ id, name, parentId: path });
        await walk(handle as FileSystemDirectoryHandle, id);
      }
    };
    await walk(this.root, '');
    return out;
  }

  async listFiles(folderId: string): Promise<DmsFile[]> {
    const dir = await this.dir(folderId);
    const files: DmsFile[] = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== 'file' || name.startsWith('.')) continue;
      files.push(this.toFile(folderId, name, await (handle as FileSystemFileHandle).getFile()));
    }
    return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createFolder(name: string, parentId: string): Promise<DmsFolder> {
    const parent = await this.dir(parentId);
    if (await this.exists(parent, name)) throw new DmsError('conflict', `"${name}" already exists here`);
    await parent.getDirectoryHandle(name, { create: true });
    return { id: join(parentId, name), name, parentId };
  }

  async renameFolder(id: string, name: string): Promise<void> {
    if (id === '') throw new DmsError('unsupported', 'The root folder cannot be renamed');
    const { dir, name: oldName } = split(id);
    const parent = await this.dir(dir);
    if (await this.exists(parent, name)) throw new DmsError('conflict', `"${name}" already exists here`);
    // The API has no rename for picked directories: copy the tree, then remove the original.
    const target = await parent.getDirectoryHandle(name, { create: true });
    await this.copyDir(await parent.getDirectoryHandle(oldName), target);
    await parent.removeEntry(oldName, { recursive: true });
  }

  async deleteFolder(id: string): Promise<void> {
    if (id === '') throw new DmsError('unsupported', 'The root folder cannot be deleted');
    const { dir, name } = split(id);
    await (await this.dir(dir)).removeEntry(name, { recursive: true });
  }

  async uploadFile(folderId: string, file: File): Promise<DmsFile> {
    const dir = await this.dir(folderId);
    if (await this.exists(dir, file.name)) throw new DmsError('conflict', `"${file.name}" already exists in this folder`);
    await this.write(dir, file.name, file);
    return this.toFile(folderId, file.name, await (await dir.getFileHandle(file.name)).getFile());
  }

  async renameFile(id: string, name: string): Promise<void> {
    const { dir, name: oldName } = split(id);
    const parent = await this.dir(dir);
    if (await this.exists(parent, name)) throw new DmsError('conflict', `"${name}" already exists in this folder`);
    const blob = await (await parent.getFileHandle(oldName)).getFile();
    await this.write(parent, name, blob);
    await parent.removeEntry(oldName);
  }

  async deleteFile(id: string): Promise<void> {
    const { dir, name } = split(id);
    await (await this.dir(dir)).removeEntry(name);
  }

  async getBlob(file: DmsFile): Promise<Blob> {
    const { dir, name } = split(file.id);
    return (await (await this.dir(dir)).getFileHandle(name)).getFile();
  }

  // ----- helpers -----

  private async dir(path: string): Promise<FileSystemDirectoryHandle> {
    let cur = this.root;
    try {
      for (const part of path.split('/').filter(Boolean)) cur = await cur.getDirectoryHandle(part);
    } catch (e) {
      throw new DmsError('not_found', 'Folder not found', e);
    }
    return cur;
  }

  private async exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    for await (const [n] of dir.entries()) if (n.toLowerCase() === name.toLowerCase()) return true;
    return false;
  }

  private async write(dir: FileSystemDirectoryHandle, name: string, data: Blob): Promise<void> {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(data);
    await w.close();
  }

  private async copyDir(from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle): Promise<void> {
    for await (const [name, handle] of from.entries()) {
      if (handle.kind === 'file') await this.write(to, name, await (handle as FileSystemFileHandle).getFile());
      else await this.copyDir(handle as FileSystemDirectoryHandle, await to.getDirectoryHandle(name, { create: true }));
    }
  }

  private toFile(folderId: string, name: string, f: File): DmsFile {
    return {
      id: join(folderId, name),
      folderId,
      name,
      fileName: name,
      mimeType: f.type || guessMimeType(name),
      size: f.size,
      modifiedAt: new Date(f.lastModified).toISOString(),
    };
  }
}

/** True where the browser can open a folder picker (Chrome/Edge over https, localhost or file://). */
export function canPickLocalFolder(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Shows the browser's folder picker and returns a read/write source over the chosen folder. */
export async function pickLocalFolder(): Promise<FsAccessSource> {
  if (!canPickLocalFolder()) throw new DmsError('unsupported', 'This browser cannot open local folders (use Chrome or Edge)');
  const picker = (window as unknown as { showDirectoryPicker: (o?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  try {
    return new FsAccessSource(await picker.call(window, { mode: 'readwrite' }));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new DmsError('unknown', 'No folder chosen', e);
    throw new DmsError('unknown', 'Could not open the folder', e);
  }
}
