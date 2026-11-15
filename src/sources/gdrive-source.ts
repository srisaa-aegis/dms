import {
  DmsError,
  guessMimeType,
  type DmsFile,
  type DmsFolder,
  type DocumentSource,
  type GDriveSourceConfig,
} from '../core';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_APP_PREFIX = 'application/vnd.google-apps.';

interface DriveItem {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
}

/** Escapes a value for use inside a single-quoted Drive query string. */
const q = (v: string): string => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * A `gdrive_source`: the Drive folder `rootFolderId` is the root of the document manager. Uses the Drive v3 REST API
 * directly with `fetch`, so it runs in a browser; supply an OAuth access token (or a function that returns one).
 * "Delete" moves items to the Drive trash (recoverable), like the ERP's soft delete.
 */
export class GDriveSource implements DocumentSource {
  readonly kind = 'gdrive_source' as const;
  readonly readOnly = false;
  label = 'Google Drive';

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: GDriveSourceConfig) {
    if (!cfg.rootFolderId) throw new DmsError('config', 'gdrive_source needs a rootFolderId');
    if (!cfg.accessToken && !cfg.getAccessToken) throw new DmsError('config', 'gdrive_source needs an accessToken or getAccessToken');
    this.fetchImpl = cfg.fetchImpl ?? ((...a) => fetch(...a));
  }

  async listFolders(): Promise<DmsFolder[]> {
    const root = await this.json<DriveItem>(`${API}/files/${encodeURIComponent(this.cfg.rootFolderId)}?fields=id,name&supportsAllDrives=true`);
    this.label = root.name;
    const out: DmsFolder[] = [{ id: root.id, name: root.name, parentId: null }];
    let level = [root.id];
    while (level.length > 0) {
      // One query per folder of the current level, level by level, so every child knows its parent.
      const results = await Promise.all(level.map(async (parent) => ({ parent, kids: await this.childFolders(parent) })));
      level = [];
      for (const { parent, kids } of results) {
        for (const c of kids) {
          out.push({ id: c.id, name: c.name, parentId: parent });
          level.push(c.id);
        }
      }
    }
    return out;
  }

  private async childFolders(parentId: string): Promise<DriveItem[]> {
    return this.list(`'${q(parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`, 'id,name,parents');
  }

  async listFiles(folderId: string): Promise<DmsFile[]> {
    const items = await this.list(
      `'${q(folderId)}' in parents and mimeType!='${FOLDER_MIME}' and trashed=false`,
      'id,name,mimeType,size,modifiedTime,parents',
    );
    return items.map((i) => this.toFile(i, folderId)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createFolder(name: string, parentId: string): Promise<DmsFolder> {
    const created = await this.json<DriveItem>(`${API}/files?fields=id,name&supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    return { id: created.id, name: created.name, parentId };
  }

  async renameFolder(id: string, name: string): Promise<void> {
    await this.patch(id, { name });
  }

  async deleteFolder(id: string): Promise<void> {
    if (id === this.cfg.rootFolderId) throw new DmsError('unsupported', 'The root folder cannot be deleted');
    await this.patch(id, { trashed: true });
  }

  async uploadFile(folderId: string, file: File): Promise<DmsFile> {
    const boundary = `dms${Math.random().toString(36).slice(2)}`;
    const metadata = { name: file.name, parents: [folderId] };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${file.type || guessMimeType(file.name)}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ]);
    const created = await this.json<DriveItem>(
      `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,parents&supportsAllDrives=true`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    return this.toFile(created, folderId);
  }

  async renameFile(id: string, name: string): Promise<void> {
    await this.patch(id, { name });
  }

  async deleteFile(id: string): Promise<void> {
    await this.patch(id, { trashed: true });
  }

  async getBlob(file: DmsFile): Promise<Blob> {
    // Google-native documents (Docs, Sheets, ...) have no bytes: export them as PDF.
    const url = file.mimeType.startsWith(GOOGLE_APP_PREFIX)
      ? `${API}/files/${encodeURIComponent(file.id)}/export?mimeType=application%2Fpdf`
      : `${API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
    const res = await this.request(url);
    return res.blob();
  }

  // ----- plumbing -----

  private toFile(i: DriveItem, folderId: string): DmsFile {
    const native = (i.mimeType ?? '').startsWith(GOOGLE_APP_PREFIX);
    return {
      id: i.id,
      folderId,
      name: i.name,
      fileName: native ? `${i.name}.pdf` : i.name,
      mimeType: native ? 'application/pdf' : (i.mimeType ?? guessMimeType(i.name)),
      size: Number(i.size ?? 0),
      modifiedAt: i.modifiedTime ?? new Date(0).toISOString(),
    };
  }

  /** All pages of a files.list query. */
  private async list(query: string, fields: string): Promise<DriveItem[]> {
    const items: DriveItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: query,
        fields: `nextPageToken,files(${fields})`,
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.json<{ files: DriveItem[]; nextPageToken?: string }>(`${API}/files?${params.toString()}`);
      items.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  private async patch(id: string, body: Record<string, unknown>): Promise<void> {
    await this.json(`${API}/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.request(url, init);
    return (await res.json()) as T;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = this.cfg.getAccessToken ? await this.cfg.getAccessToken() : this.cfg.accessToken;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });
    } catch (e) {
      throw new DmsError('network', 'Could not reach Google Drive', e);
    }
    if (res.ok) return res;
    if (res.status === 401) throw new DmsError('auth', 'Google Drive rejected the access token (expired or missing the drive scope)');
    if (res.status === 403) throw new DmsError('auth', 'Google Drive denied access to this item');
    if (res.status === 404) throw new DmsError('not_found', 'Not found in Google Drive');
    throw new DmsError('unknown', `Google Drive error ${res.status}`);
  }
}
