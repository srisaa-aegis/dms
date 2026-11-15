import { DmsError, type DocumentSource, type SourceConfig } from '../core';
import { FsAccessSource } from './fs-access-source';
import { GDriveSource } from './gdrive-source';
import { ManifestFolderSource } from './manifest-source';

/**
 * Builds a document source from configuration. `source` picks the kind; only that block is read:
 *
 *   createSource({ source: 'folder_source', folder_source: { manifest, baseUrl: 'sample-files' } })
 *   createSource({ source: 'folder_source', folder_source: { handle } })          // from showDirectoryPicker()
 *   createSource({ source: 'gdrive_source', gdrive_source: { rootFolderId, accessToken } })
 */
export function createSource(config: SourceConfig): DocumentSource {
  switch (config.source) {
    case 'folder_source': {
      const c = config.folder_source;
      if (!c) throw new DmsError('config', 'source is "folder_source" but folder_source is missing');
      if (c.handle) return new FsAccessSource(c.handle);
      if (c.manifest) {
        const opts: { baseUrl?: string; readOnly?: boolean } = {};
        if (c.baseUrl !== undefined) opts.baseUrl = c.baseUrl;
        if (c.readOnly !== undefined) opts.readOnly = c.readOnly;
        return new ManifestFolderSource(c.manifest, opts);
      }
      throw new DmsError('config', 'folder_source needs a "handle" (picked folder) or a "manifest"');
    }
    case 'gdrive_source': {
      const c = config.gdrive_source;
      if (!c) throw new DmsError('config', 'source is "gdrive_source" but gdrive_source is missing');
      return new GDriveSource(c);
    }
    default:
      throw new DmsError('config', `Unknown source "${String((config as { source: unknown }).source)}"`);
  }
}
