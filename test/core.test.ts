import { baseName, buildFolderTree, descendantIds, extensionOf, fileIcon, folderPath, formatSize, guessMimeType, isViewable, validateName } from '../src/core';
import type { DmsFolder } from '../src/core';

const folders: DmsFolder[] = [
  { id: 'r', name: 'Root', parentId: null },
  { id: 'b', name: 'beta', parentId: 'r' },
  { id: 'a', name: 'Alpha', parentId: 'r' },
  { id: 'a1', name: 'Sub', parentId: 'a' },
];

describe('format', () => {
  it('formats sizes', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('finds extensions and names', () => {
    expect(extensionOf('Report.FINAL.PDF')).toBe('pdf');
    expect(extensionOf('noext')).toBe('');
    expect(extensionOf('.hidden')).toBe('');
    expect(baseName('Annual Report.pdf')).toBe('Annual Report');
    expect(baseName('.hidden')).toBe('.hidden');
  });
  it('guesses mime types and decides what is viewable', () => {
    expect(guessMimeType('a.pdf')).toBe('application/pdf');
    expect(guessMimeType('a.xyz')).toBe('application/octet-stream');
    expect(isViewable('application/pdf')).toBe(true);
    expect(isViewable('image/png')).toBe(true);
    expect(isViewable(guessMimeType('a.docx'))).toBe(false);
  });
  it('picks icons by type', () => {
    expect(fileIcon('application/pdf')).toContain('pi-file-pdf');
    expect(fileIcon(guessMimeType('a.xlsx'))).toContain('pi-file-excel');
    expect(fileIcon('application/x-unknown')).toContain('pi-file');
  });
  it('validates names', () => {
    expect(validateName('  ')).not.toBeNull();
    expect(validateName('a/b')).not.toBeNull();
    expect(validateName('..')).not.toBeNull();
    expect(validateName('x'.repeat(256))).not.toBeNull();
    expect(validateName('Q3 report.pdf')).toBeNull();
  });
});

describe('tree', () => {
  it('builds a sorted forest', () => {
    const t = buildFolderTree(folders);
    expect(t).toHaveLength(1);
    expect(t[0]!.children.map((c) => c.folder.name)).toEqual(['Alpha', 'beta']);
    expect(t[0]!.children[0]!.children.map((c) => c.folder.id)).toEqual(['a1']);
  });
  it('turns orphans into roots', () => {
    expect(buildFolderTree([{ id: 'x', name: 'X', parentId: 'missing' }])).toHaveLength(1);
  });
  it('builds a root-to-folder path', () => {
    expect(folderPath(folders, 'a1').map((f) => f.id)).toEqual(['r', 'a', 'a1']);
    expect(folderPath(folders, 'nope')).toEqual([]);
  });
  it('survives a cycle in the data', () => {
    const cyc: DmsFolder[] = [
      { id: 'x', name: 'X', parentId: 'y' },
      { id: 'y', name: 'Y', parentId: 'x' },
    ];
    expect(folderPath(cyc, 'x').length).toBeLessThanOrEqual(2);
  });
  it('lists descendants', () => {
    expect(descendantIds(folders, 'a').sort()).toEqual(['a', 'a1']);
  });
});
