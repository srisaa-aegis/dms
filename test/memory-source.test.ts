import { DmsError } from '../src/core';
import type { ManifestFolder } from '../src/core';
import { ManifestFolderSource, MemorySource, createSource } from '../src/sources';

const file = (name: string, text = 'hello') => new File([text], name, { type: 'text/plain' });

describe('MemorySource', () => {
  it('starts with a root and supports folder + file CRUD', async () => {
    const s = new MemorySource({ label: 'Mem' });
    const [root] = await s.listFolders();
    expect(root).toMatchObject({ id: 'root', name: 'Mem', parentId: null });

    const sub = await s.createFolder('Sub', 'root');
    const up = await s.uploadFile(sub.id, file('a.txt', 'abc'));
    expect(up).toMatchObject({ name: 'a.txt', size: 3, folderId: sub.id });
    expect(await (await s.getBlob(up)).text()).toBe('abc');

    await s.renameFile(up.id, 'b.txt');
    expect((await s.listFiles(sub.id)).map((f) => f.name)).toEqual(['b.txt']);

    await s.renameFolder(sub.id, 'Renamed');
    expect((await s.listFolders()).map((f) => f.name)).toContain('Renamed');

    await s.deleteFile(up.id);
    expect(await s.listFiles(sub.id)).toEqual([]);
  });

  it('refuses duplicate names (case-insensitive) with a conflict error', async () => {
    const s = new MemorySource({ label: 'Mem' });
    await s.createFolder('Docs', 'root');
    await expect(s.createFolder('docs', 'root')).rejects.toMatchObject({ code: 'conflict' });
    await s.uploadFile('root', file('a.txt'));
    await expect(s.uploadFile('root', file('A.TXT'))).rejects.toMatchObject({ code: 'conflict' });
  });

  it('deleting a folder removes its sub-folders and files', async () => {
    const s = new MemorySource({ label: 'Mem' });
    const a = await s.createFolder('A', 'root');
    const b = await s.createFolder('B', a.id);
    await s.uploadFile(b.id, file('x.txt'));
    await s.deleteFolder(a.id);
    expect((await s.listFolders()).map((f) => f.id)).toEqual(['root']);
    await expect(s.listFiles(b.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('protects the root and honours read-only', async () => {
    const s = new MemorySource({ label: 'Mem' });
    await expect(s.deleteFolder('root')).rejects.toBeInstanceOf(DmsError);
    await expect(s.renameFolder('root', 'x')).rejects.toBeInstanceOf(DmsError);
    const ro = new MemorySource({ label: 'RO', readOnly: true });
    await expect(ro.createFolder('x', 'root')).rejects.toMatchObject({ code: 'read_only' });
    await expect(ro.uploadFile('root', file('a.txt'))).rejects.toMatchObject({ code: 'read_only' });
  });
});

const manifest: ManifestFolder = {
  name: 'Company',
  files: [{ name: 'README.txt', size: 10, modifiedAt: '2026-01-01T00:00:00Z' }],
  folders: [{ name: 'Invoices FY', files: [{ name: 'INV 1.pdf', size: 99, modifiedAt: '2026-02-02T00:00:00Z' }] }],
};

describe('ManifestFolderSource / createSource', () => {
  it('builds the tree and gives encoded relative URLs', async () => {
    const s = new ManifestFolderSource(manifest, { baseUrl: 'sample-files/' });
    const folders = await s.listFolders();
    expect(folders.map((f) => f.name)).toEqual(['Company', 'Invoices FY']);
    const [readme] = await s.listFiles('root');
    expect(s.getUrl(readme!)).toBe('sample-files/README.txt');
    const inv = (await s.listFiles(folders[1]!.id))[0]!;
    expect(inv.mimeType).toBe('application/pdf');
    expect(s.getUrl(inv)).toBe('sample-files/Invoices%20FY/INV%201.pdf');
    expect(s.kind).toBe('folder_source');
  });

  it('keeps the original URL after a rename', async () => {
    const s = new ManifestFolderSource(manifest, { baseUrl: 'sf' });
    const [f] = await s.listFiles('root');
    await s.renameFile(f!.id, 'NEW.txt');
    expect(s.getUrl({ ...f!, name: 'NEW.txt' })).toBe('sf/README.txt');
  });

  it('createSource picks by "source" and validates the config', () => {
    expect(createSource({ source: 'folder_source', folder_source: { manifest } }).kind).toBe('folder_source');
    expect(() => createSource({ source: 'folder_source' })).toThrow(/missing/);
    expect(() => createSource({ source: 'folder_source', folder_source: {} })).toThrow(/handle/);
    expect(() => createSource({ source: 'gdrive_source' })).toThrow(/missing/);
    expect(() => createSource({ source: 'gdrive_source', gdrive_source: { rootFolderId: '', accessToken: 't' } })).toThrow(/rootFolderId/);
    expect(() => createSource({ source: 'gdrive_source', gdrive_source: { rootFolderId: 'r' } })).toThrow(/accessToken/);
    expect(createSource({ source: 'gdrive_source', gdrive_source: { rootFolderId: 'r', accessToken: 't' } }).kind).toBe('gdrive_source');
  });
});
