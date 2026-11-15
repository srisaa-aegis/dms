import { DmsError, baseName, guessMimeType, type DmsFile, type DmsFolder, type DocumentSource } from '../core';

interface Entry {
  file: DmsFile;
  blob?: Blob;
  url?: string;
}

export interface MemorySourceOptions {
  label: string;
  readOnly?: boolean;
  kind?: DocumentSource['kind'];
}

/**
 * A document source that lives in memory (changes are lost on reload). It is the reference implementation of
 * `DocumentSource`, the base of the manifest source, and handy for tests and demos.
 */
export class MemorySource implements DocumentSource {
  readonly kind: DocumentSource['kind'];
  readonly label: string;
  readonly readOnly: boolean;
  readonly rootId = 'root';

  private readonly folders = new Map<string, DmsFolder>();
  private readonly files = new Map<string, Entry>();
  private seq = 0;

  constructor(opts: MemorySourceOptions) {
    this.kind = opts.kind ?? 'memory_source';
    this.label = opts.label;
    this.readOnly = opts.readOnly ?? false;
    this.folders.set(this.rootId, { id: this.rootId, name: opts.label, parentId: null });
  }

  // ----- seeding (bypasses the read-only guard) -----

  seedFolder(name: string, parentId: string): DmsFolder {
    const folder: DmsFolder = { id: `f${++this.seq}`, name, parentId };
    this.folders.set(folder.id, folder);
    return folder;
  }

  seedFile(folderId: string, f: { name: string; size: number; modifiedAt: string; mimeType?: string }, extra: { blob?: Blob; url?: string } = {}): DmsFile {
    const file: DmsFile = {
      id: `d${++this.seq}`,
      folderId,
      name: f.name,
      fileName: f.name,
      mimeType: f.mimeType ?? guessMimeType(f.name),
      size: f.size,
      modifiedAt: f.modifiedAt,
    };
    const entry: Entry = { file };
    if (extra.blob) entry.blob = extra.blob;
    if (extra.url) entry.url = extra.url;
    this.files.set(file.id, entry);
    return file;
  }

  // ----- DocumentSource -----

  async listFolders(): Promise<DmsFolder[]> {
    return [...this.folders.values()].map((f) => ({ ...f }));
  }

  async listFiles(folderId: string): Promise<DmsFile[]> {
    this.requireFolder(folderId);
    return [...this.files.values()]
      .filter((e) => e.file.folderId === folderId)
      .map((e) => ({ ...e.file }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createFolder(name: string, parentId: string): Promise<DmsFolder> {
    this.guard();
    this.requireFolder(parentId);
    this.ensureFolderNameFree(parentId, name);
    return { ...this.seedFolder(name, parentId) };
  }

  async renameFolder(id: string, name: string): Promise<void> {
    this.guard();
    const f = this.requireFolder(id);
    if (f.parentId === null) throw new DmsError('unsupported', 'The root folder cannot be renamed');
    this.ensureFolderNameFree(f.parentId, name, id);
    f.name = name;
  }

  async deleteFolder(id: string): Promise<void> {
    this.guard();
    const f = this.requireFolder(id);
    if (f.parentId === null) throw new DmsError('unsupported', 'The root folder cannot be deleted');
    const doomed = new Set<string>([id]);
    for (let changed = true; changed; ) {
      changed = false;
      for (const c of this.folders.values()) {
        if (c.parentId && doomed.has(c.parentId) && !doomed.has(c.id)) {
          doomed.add(c.id);
          changed = true;
        }
      }
    }
    for (const [fid, e] of this.files) if (doomed.has(e.file.folderId)) this.files.delete(fid);
    for (const d of doomed) this.folders.delete(d);
  }

  async uploadFile(folderId: string, file: File): Promise<DmsFile> {
    this.guard();
    this.requireFolder(folderId);
    this.ensureFileNameFree(folderId, file.name);
    return {
      ...this.seedFile(
        folderId,
        { name: file.name, size: file.size, modifiedAt: new Date().toISOString(), mimeType: file.type || guessMimeType(file.name) },
        { blob: file },
      ),
    };
  }

  async renameFile(id: string, name: string): Promise<void> {
    this.guard();
    const e = this.requireFile(id);
    this.ensureFileNameFree(e.file.folderId, name, id);
    e.file.name = name;
    e.file.fileName = name;
  }

  async deleteFile(id: string): Promise<void> {
    this.guard();
    this.requireFile(id);
    this.files.delete(id);
  }

  async getBlob(file: DmsFile): Promise<Blob> {
    const e = this.requireFile(file.id);
    if (e.blob) return e.blob;
    if (e.url) {
      const res = await fetch(e.url);
      if (!res.ok) throw new DmsError('not_found', `Could not load ${file.name}`);
      return res.blob();
    }
    throw new DmsError('unsupported', `${file.name} has no content to show`);
  }

  getUrl(file: DmsFile): string | null {
    return this.files.get(file.id)?.url ?? null;
  }

  // ----- helpers -----

  private guard(): void {
    if (this.readOnly) throw new DmsError('read_only', 'This source is read-only');
  }

  private requireFolder(id: string): DmsFolder {
    const f = this.folders.get(id);
    if (!f) throw new DmsError('not_found', 'Folder not found');
    return f;
  }

  private requireFile(id: string): Entry {
    const e = this.files.get(id);
    if (!e) throw new DmsError('not_found', 'File not found');
    return e;
  }

  private ensureFolderNameFree(parentId: string, name: string, exceptId?: string): void {
    const clash = [...this.folders.values()].some(
      (f) => f.parentId === parentId && f.id !== exceptId && f.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) throw new DmsError('conflict', `A folder named "${name}" already exists here`);
  }

  private ensureFileNameFree(folderId: string, name: string, exceptId?: string): void {
    const clash = [...this.files.values()].some(
      (e) => e.file.folderId === folderId && e.file.id !== exceptId && e.file.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) throw new DmsError('conflict', `"${baseName(name)}" already exists in this folder`);
  }
}
