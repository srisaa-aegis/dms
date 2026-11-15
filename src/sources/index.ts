// Framework-free adapters that implement DocumentSource.
export { MemorySource, type MemorySourceOptions } from './memory-source';
export { ManifestFolderSource, type ManifestSourceOptions } from './manifest-source';
export { GDriveSource } from './gdrive-source';
export { FsAccessSource, canPickLocalFolder, pickLocalFolder } from './fs-access-source';
export { createSource } from './create-source';
