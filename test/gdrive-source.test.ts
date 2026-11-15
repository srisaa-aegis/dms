import { GDriveSource } from '../src/sources';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch mock: first matching route wins, every call is recorded. */
function mockFetch(routes: Array<[RegExp, () => Response]>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const hit = routes.find(([re]) => re.test(String(url)));
    return hit ? hit[1]() : new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const json = (o: unknown, status = 200): Response => new Response(JSON.stringify(o), { status });
const qOf = (url: string): string => new URL(url).searchParams.get('q') ?? '';
const auth = (c: Call): string => (c.init?.headers as Record<string, string>)['Authorization'] ?? '';

describe('GDriveSource', () => {
  it('walks the folder tree level by level and takes the label from the root name', async () => {
    const kids: Record<string, Array<{ id: string; name: string }>> = {
      ROOT: [
        { id: 'A', name: 'RFPs' },
        { id: 'B', name: 'Contracts' },
      ],
      A: [{ id: 'A1', name: '2026' }],
    };
    const fetchImpl = (async (url: string) => {
      const u = String(url);
      if (/files\/ROOT\?/.test(u)) return json({ id: 'ROOT', name: 'Shared Docs' });
      const m = /^'([^']+)' in parents/.exec(qOf(u));
      return json({ files: m ? (kids[m[1]!] ?? []) : [] });
    }) as unknown as typeof fetch;
    const s = new GDriveSource({ rootFolderId: 'ROOT', accessToken: 'tok', fetchImpl });
    expect(await s.listFolders()).toEqual([
      { id: 'ROOT', name: 'Shared Docs', parentId: null },
      { id: 'A', name: 'RFPs', parentId: 'ROOT' },
      { id: 'B', name: 'Contracts', parentId: 'ROOT' },
      { id: 'A1', name: '2026', parentId: 'A' },
    ]);
    expect(s.label).toBe('Shared Docs');
  });

  it('lists files, mapping Drive fields and exporting Google-native docs as PDF', async () => {
    const { fetchImpl, calls } = mockFetch([
      [
        /files\?/,
        () =>
          json({
            files: [
              { id: 'f1', name: 'b.pdf', mimeType: 'application/pdf', size: '2048', modifiedTime: '2026-10-01T00:00:00Z' },
              { id: 'f2', name: 'A Sheet', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-10-02T00:00:00Z' },
            ],
          }),
      ],
    ]);
    const s = new GDriveSource({ rootFolderId: 'ROOT', accessToken: 'tok', fetchImpl });
    const files = await s.listFiles('F');
    expect(files.map((f) => f.name)).toEqual(['A Sheet', 'b.pdf']);
    expect(files[0]).toMatchObject({ fileName: 'A Sheet.pdf', mimeType: 'application/pdf', size: 0 });
    expect(files[1]).toMatchObject({ size: 2048, folderId: 'F' });
    expect(qOf(calls[0]!.url)).toContain("'F' in parents");
    expect(qOf(calls[0]!.url)).toContain('trashed=false');
    expect(auth(calls[0]!)).toBe('Bearer tok');
  });

  it('follows pagination', async () => {
    let page = 0;
    const { fetchImpl, calls } = mockFetch([
      [/files\?/, () => (page++ === 0 ? json({ files: [{ id: '1', name: 'a.txt' }], nextPageToken: 'NEXT' }) : json({ files: [{ id: '2', name: 'b.txt' }] }))],
    ]);
    const s = new GDriveSource({ rootFolderId: 'R', accessToken: 't', fetchImpl });
    expect((await s.listFiles('F')).map((f) => f.id)).toEqual(['1', '2']);
    expect(new URL(calls[1]!.url).searchParams.get('pageToken')).toBe('NEXT');
  });

  it('escapes quotes in ids used in queries', async () => {
    const { fetchImpl, calls } = mockFetch([[/files\?/, () => json({ files: [] })]]);
    await new GDriveSource({ rootFolderId: 'R', accessToken: 't', fetchImpl }).listFiles("a'b");
    expect(qOf(calls[0]!.url)).toContain("'a\\'b' in parents");
  });

  it('creates folders, renames, and trashes instead of deleting', async () => {
    const { fetchImpl, calls } = mockFetch([
      [/files\?fields=id,name/, () => json({ id: 'NEW', name: 'Sub' })],
      [/files\/X\?/, () => json({})],
    ]);
    const s = new GDriveSource({ rootFolderId: 'R', accessToken: 't', fetchImpl });
    expect(await s.createFolder('Sub', 'P')).toEqual({ id: 'NEW', name: 'Sub', parentId: 'P' });
    expect(JSON.parse(calls[0]!.init!.body as string)).toMatchObject({ name: 'Sub', parents: ['P'], mimeType: 'application/vnd.google-apps.folder' });
    await s.renameFile('X', 'new.txt');
    expect(calls[1]!.init!.method).toBe('PATCH');
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({ name: 'new.txt' });
    await s.deleteFile('X');
    expect(JSON.parse(calls[2]!.init!.body as string)).toEqual({ trashed: true });
    await expect(s.deleteFolder('R')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('uploads with a multipart body that carries the name and parent', async () => {
    const { fetchImpl, calls } = mockFetch([
      [/upload\/drive\/v3\/files/, () => json({ id: 'U', name: 'n.txt', mimeType: 'text/plain', size: '5', modifiedTime: '2026-11-01T00:00:00Z' })],
    ]);
    const s = new GDriveSource({ rootFolderId: 'R', accessToken: 't', fetchImpl });
    const f = await s.uploadFile('F', new File(['hello'], 'n.txt', { type: 'text/plain' }));
    expect(f).toMatchObject({ id: 'U', name: 'n.txt', size: 5, folderId: 'F' });
    expect((calls[0]!.init!.headers as Record<string, string>)['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    const body = await (calls[0]!.init!.body as Blob).text();
    expect(body).toContain('"name":"n.txt"');
    expect(body).toContain('"parents":["F"]');
    expect(body).toContain('hello');
  });

  it('downloads bytes, or exports Google-native files as PDF', async () => {
    const { fetchImpl, calls } = mockFetch([[/files\//, () => new Response('data')]]);
    const s = new GDriveSource({ rootFolderId: 'R', accessToken: 't', fetchImpl });
    const base = { folderId: 'F', fileName: 'x', size: 1, modifiedAt: '' };
    expect(await (await s.getBlob({ ...base, id: 'a b', name: 'x', mimeType: 'application/pdf' })).text()).toBe('data');
    expect(calls[0]!.url).toContain('files/a%20b?alt=media');
    await s.getBlob({ ...base, id: 'g', name: 'x', mimeType: 'application/vnd.google-apps.document' });
    expect(calls[1]!.url).toContain('files/g/export?mimeType=application%2Fpdf');
  });

  it('asks getAccessToken for a fresh token on every request', async () => {
    let n = 0;
    const { fetchImpl, calls } = mockFetch([[/files\?/, () => json({ files: [] })]]);
    const s = new GDriveSource({ rootFolderId: 'R', getAccessToken: async () => `tok${++n}`, fetchImpl });
    await s.listFiles('F');
    await s.listFiles('F');
    expect(auth(calls[0]!)).toBe('Bearer tok1');
    expect(auth(calls[1]!)).toBe('Bearer tok2');
  });

  it('maps HTTP failures to readable error codes', async () => {
    const make = (status: number): GDriveSource =>
      new GDriveSource({ rootFolderId: 'R', accessToken: 't', fetchImpl: mockFetch([[/./, () => new Response('', { status })]]).fetchImpl });
    await expect(make(401).listFiles('F')).rejects.toMatchObject({ code: 'auth' });
    await expect(make(403).listFiles('F')).rejects.toMatchObject({ code: 'auth' });
    await expect(make(404).listFiles('F')).rejects.toMatchObject({ code: 'not_found' });
    await expect(make(500).listFiles('F')).rejects.toMatchObject({ code: 'unknown' });
    const offline = new GDriveSource({
      rootFolderId: 'R',
      accessToken: 't',
      fetchImpl: (async () => {
        throw new TypeError('offline');
      }) as unknown as typeof fetch,
    });
    await expect(offline.listFiles('F')).rejects.toMatchObject({ code: 'network' });
  });
});
