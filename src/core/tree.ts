import type { DmsFolder } from './types';

export interface FolderNode {
  folder: DmsFolder;
  children: FolderNode[];
}

/** Flat folder list -> forest, children sorted by name (case-insensitive). Orphans become roots. */
export function buildFolderTree(folders: readonly DmsFolder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(folders.map((f) => [f.id, { folder: f, children: [] }]));
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.folder.parentId ? nodes.get(node.folder.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: FolderNode[]): void => {
    list.sort((a, b) => a.folder.name.localeCompare(b.folder.name, undefined, { sensitivity: 'base' }));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Root-to-folder path, for breadcrumbs. Empty when the id is unknown. */
export function folderPath(folders: readonly DmsFolder[], id: string): DmsFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: DmsFolder[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** The folder and everything below it. */
export function descendantIds(folders: readonly DmsFolder[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const f of folders) if (f.parentId === out[i]) out.push(f.id);
  }
  return out;
}
