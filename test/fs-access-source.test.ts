import { FsAccessSource } from '../src/sources';

/** Minimal in-memory stand-ins for the File System Access API handles. */
class FakeFile {
  readonly kind = 'file' as const;
  blob = new Blob([]);
  constructor(public name: string) {}
  async getFile(): Promise<File> {
    return new File([this.blob], this.name, { lastModified: Date.UTC(2026, 10, 1) });
  }
  async createWritable(): Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> {
    return {
      write: async (d: Blob) => {
        this.blob = d;
      },
      close: async () => undefined,
    };
  }
}
class FakeDir {
  readonly kind = 'directory' as const;
  children = new Map<string, FakeDir | FakeFile>();
  constructor(public name: string) {}
  async *entries(): AsyncGenerator<[string, FakeDir | FakeFile]> {
    for (const e of this.children) yield e;
  }
  async getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<FakeDir> {
    let c = this.children.get(name);
    if (!c && o?.create) {
      c = new FakeDir(name);
      this.children.set(name, c);
    }
    if (!c || c.kind !== 'directory') throw new DOMException('not found', 'NotFoundError');
    return c;
  }
  async getFileHandle(name: string, o?: { create?: boolean }): Promise<FakeFile> {
    let c = this.children.get(name);
    if (!c && o?.create) {
      c = new FakeFile(name);
      this.children.set(name, c);
    }
    if (!c || c.kind !== 'file') throw new DOMException('not found', 'NotFoundError');
    return c;
  }
  async removeEntry(name: string): Promise<void> {
    this.children.delete(name);
  }
}

const make = (): { root: FakeDir; s: FsAccessSource } => {
  const root = new FakeDir('Picked');
  return { root, s: new FsAccessSource(root as unknown as FileSystemDirectoryHandle) };
};
const file = (name: string, text = 'x'): File => new File([text], name);

describe('FsAccessSource (folder_source over a picked folder)', () => {
  it('lists nested folders with path ids and skips dot-folders', async () => {
    const { root, s } = make();
    const a = new FakeDir('A');
    a.children.set('B', new FakeDir('B'));
    root.children.set('A', a);
    root.children.set('.git', new FakeDir('.git'));
    expect(await s.listFolders()).toEqual([
      { id: '', name: 'Picked', parentId: null },
      { id: 'A', name: 'A', parentId: '' },
      { id: 'A/B', name: 'B', parentId: 'A' },
    ]);
    expect(s.label).toBe('Picked');
  });

  it('creates folders, uploads, lists, reads back and deletes', async () => {
    const { s } = make();
    const sub = await s.createFolder('Docs', '');
    expect(sub.id).toBe('Docs');
    const up = await s.uploadFile('Docs', file('a.txt', 'hello'));
    expect(up).toMatchObject({ id: 'Docs/a.txt', name: 'a.txt', size: 5, folderId: 'Docs' });
    expect((await s.listFiles('Docs')).map((f) => f.name)).toEqual(['a.txt']);
    expect(await (await s.getBlob(up)).text()).toBe('hello');
    await s.deleteFile(up.id);
    expect(await s.listFiles('Docs')).toEqual([]);
    await s.deleteFolder('Docs');
    expect((await s.listFolders()).map((f) => f.id)).toEqual(['']);
  });

  it('renames files (copy + remove) and folders (copy tree + remove)', async () => {
    const { s } = make();
    await s.createFolder('Old', '');
    await s.uploadFile('Old', file('a.txt', 'data'));
    await s.renameFile('Old/a.txt', 'b.txt');
    expect((await s.listFiles('Old')).map((f) => f.name)).toEqual(['b.txt']);
    await s.renameFolder('Old', 'New');
    expect((await s.listFolders()).map((f) => f.id)).toEqual(['', 'New']);
    expect(await (await s.getBlob((await s.listFiles('New'))[0]!)).text()).toBe('data');
  });

  it('rejects clashes and root changes', async () => {
    const { s } = make();
    await s.createFolder('Docs', '');
    await expect(s.createFolder('docs', '')).rejects.toMatchObject({ code: 'conflict' });
    await s.uploadFile('Docs', file('a.txt'));
    await expect(s.uploadFile('Docs', file('A.txt'))).rejects.toMatchObject({ code: 'conflict' });
    await expect(s.deleteFolder('')).rejects.toMatchObject({ code: 'unsupported' });
    await expect(s.renameFolder('', 'x')).rejects.toMatchObject({ code: 'unsupported' });
    await expect(s.listFiles('Nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
