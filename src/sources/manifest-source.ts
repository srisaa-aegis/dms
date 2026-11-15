import type { ManifestFolder } from '../core';
import { MemorySource } from './memory-source';

export interface ManifestSourceOptions {
  /** Where the files are served from, relative to the page (default `.`). */
  baseUrl?: string;
  readOnly?: boolean;
}

/**
 * A `folder_source` backed by a pre-listed tree (the manifest). Browsers cannot list a folder from `file://`, so
 * the tree is described as data and each file is opened through a relative URL (`baseUrl/folder/file`).
 * Edits (upload, rename, delete, new folder) are kept in memory only unless `readOnly` is set.
 */
export class ManifestFolderSource extends MemorySource {
  constructor(manifest: ManifestFolder, opts: ManifestSourceOptions = {}) {
    super({ label: manifest.name, readOnly: opts.readOnly ?? false, kind: 'folder_source' });
    const base = (opts.baseUrl ?? '.').replace(/\/+$/, '');
    this.load(manifest, this.rootId, [], base);
  }

  private load(node: ManifestFolder, folderId: string, path: string[], base: string): void {
    for (const f of node.files ?? []) {
      const url = [base, ...path, f.name].map((p, i) => (i === 0 ? p : encodeURIComponent(p))).join('/');
      this.seedFile(folderId, f, { url });
    }
    for (const sub of node.folders ?? []) {
      const created = this.seedFolder(sub.name, folderId);
      this.load(sub, created.id, [...path, sub.name], base);
    }
  }
}
