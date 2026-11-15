/** Contracts of the document manager. Pure types: no Angular, no DOM beyond File/Blob. */

export interface DmsFolder {
  id: string;
  name: string;
  /** null for the root folder of a source. */
  parentId: string | null;
}

export interface DmsFile {
  id: string;
  folderId: string;
  /** Display name. */
  name: string;
  /** Name on disk / in Drive (used for downloads). */
  fileName: string;
  mimeType: string;
  /** Bytes. */
  size: number;
  /** ISO 8601 */
  modifiedAt: string;
}

/**
 * Where documents live. The document manager only ever talks to this interface, so any back-end
 * (a local folder, Google Drive, your own API) can be plugged in.
 */
export interface DocumentSource {
  readonly kind: 'folder_source' | 'gdrive_source' | 'memory_source';
  /** Human-readable label for the UI (e.g. the root folder name). */
  readonly label: string;
  /** When true the UI hides every action that changes anything. */
  readonly readOnly: boolean;

  /** The whole folder tree as a flat list; the first item is the root. */
  listFolders(): Promise<DmsFolder[]>;
  listFiles(folderId: string): Promise<DmsFile[]>;
  createFolder(name: string, parentId: string): Promise<DmsFolder>;
  renameFolder(id: string, name: string): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  uploadFile(folderId: string, file: File): Promise<DmsFile>;
  renameFile(id: string, name: string): Promise<void>;
  deleteFile(id: string): Promise<void>;
  /** File content (used to view and download when `getUrl` is not available). */
  getBlob(file: DmsFile): Promise<Blob>;
  /** Optional direct URL (e.g. a relative link on a web/file server); preferred over `getBlob`. */
  getUrl?(file: DmsFile): string | null;
}

// ----- Source configuration -----

export interface ManifestFile {
  name: string;
  size: number;
  /** ISO 8601 */
  modifiedAt: string;
  mimeType?: string;
}

export interface ManifestFolder {
  name: string;
  folders?: ManifestFolder[];
  files?: ManifestFile[];
}

export interface FolderSourceConfig {
  /** A directory the user picked with `showDirectoryPicker()` (File System Access API; Chrome/Edge). Read + write. */
  handle?: FileSystemDirectoryHandle;
  /** Or a pre-listed tree (used where a browser cannot read a folder, e.g. `file://`). */
  manifest?: ManifestFolder;
  /** With `manifest`: where the files are served from, relative to the page (default `.`). */
  baseUrl?: string;
  /** With `manifest`: edits are kept in memory only. Set true to forbid them. */
  readOnly?: boolean;
}

export interface GDriveSourceConfig {
  /** The Drive folder that acts as the root of the document manager. */
  rootFolderId: string;
  /** An OAuth access token with the `drive` scope... */
  accessToken?: string;
  /** ...or a function returning a fresh one (preferred: tokens expire). */
  getAccessToken?: () => Promise<string>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Pick one source with `source`; only the matching block is read. */
export interface SourceConfig {
  source: 'folder_source' | 'gdrive_source';
  folder_source?: FolderSourceConfig;
  gdrive_source?: GDriveSourceConfig;
}
