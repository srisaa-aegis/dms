# stl-dms

A document manager for Angular (PrimeNG + Tailwind), extracted from the SrisaaERP Documents module. Documents live in a
**source** that you choose by configuration: a local folder (`folder_source`) or Google Drive (`gdrive_source`).

```
src/
  core/              pure TypeScript, no Angular: types, the DocumentSource interface, errors, formatters, tree helpers
  sources/           framework-free adapters that implement DocumentSource
    folder: manifest-source (pre-listed tree, used by the demo) and fs-access-source (a real folder, read/write)
    gdrive-source      Google Drive v3 REST API
    memory-source      in-memory reference implementation (tests, demos)
    create-source      builds a source from config
  components/        the child widgets, one folder each
    folder-tree/  breadcrumb/  file-list/  name-dialog/  upload-dialog/
  document-manager/  the core component: composes the widgets and talks only to a DocumentSource
  index.ts           public API
demo/                the hosting app: index.html, main.ts, data/config.js, data/manifest.js, sample-files/
scripts/             build-demo.js (npm run demo), gen-samples.js (npm run samples)
test/                Jest tests for the core and the sources
```

The document manager never knows where files live. It only calls the `DocumentSource` it is given, so a new back-end
(your own API, S3, ...) is one class that implements that interface.

## Demo (no server needed)

```bash
npm install
npm run demo        # builds demo/dms.js, then open demo/index.html
```

`demo/index.html` opens straight from disk (`file://`). The demo ships with **17 dummy files** in `demo/sample-files/`
(PDF, DOCX, XLSX, PNG, TXT across RFPs, Contracts, Invoices, Project Reports and HR Policies).

- **Choose the source** in `demo/data/config.js` (`source: 'folder_source'` or `'gdrive_source'`), then refresh.
- **Browse a real folder** with the *Open local folder...* button (Chrome / Edge): full read/write on that folder.
- The sample tree comes from `demo/data/manifest.js`; edits made to the sample files (upload, rename, delete, new folder)
  live in memory only and reset on refresh.
- `npm run samples` regenerates the sample files and the manifest. `dms.js`, `dms.css` and `media/` are generated;
  re-run `npm run demo` after changing anything under `src/` or `demo/*.ts`.

## Configuration

```ts
import { createSource, DocumentManagerComponent } from 'stl-dms';

// 1. A pre-listed folder tree (works from file://; files are opened by relative URL)
createSource({ source: 'folder_source', folder_source: { manifest, baseUrl: 'sample-files', readOnly: false } });

// 2. A real folder picked by the user (File System Access API; Chrome/Edge)
const source = await pickLocalFolder();            // or: createSource({ source: 'folder_source', folder_source: { handle } })

// 3. Google Drive
createSource({ source: 'gdrive_source', gdrive_source: { rootFolderId: '...', getAccessToken: () => myToken() } });
```
```html
<dms-document-manager [source]="source" title="Documents" (failed)="log($event)" (changed)="refresh()" />
```

| Input | Type | |
|---|---|---|
| `source` | `DocumentSource` | required; change it at any time to switch sources |
| `title` | `string` | default `Documents` |
| `maxFileSize` | `number` | bytes, default 25 MB |

| Output | |
|---|---|
| `failed` | a readable message whenever an operation fails (also shown as a toast) |
| `changed` | after any change to folders or files |

### The sources

| | `folder_source` (manifest) | `folder_source` (picked folder) | `gdrive_source` |
|---|---|---|---|
| Browse, view, download | yes | yes | yes |
| New folder, upload, rename, delete | in memory only | yes, on disk | yes, in Drive |
| Delete | removes from the list | **permanent** (no recycle bin in browsers) | moves to the Drive **trash** |
| Needs | files served relative to the page | Chrome / Edge | an OAuth access token with the `drive` scope |

Notes on Google Drive: the Drive folder `rootFolderId` is the root of the manager. Google-native files (Docs, Sheets, ...)
are downloaded as PDF. Tokens expire, so pass `getAccessToken` rather than a fixed `accessToken` in real apps. Calls go
from the browser to `googleapis.com`; keep the OAuth client and consent flow in your host app.

## Scripts

| Script | |
|---|---|
| `npm run demo` | build the demo bundle (Angular compile + one classic-script bundle) |
| `npm run samples` | regenerate `demo/sample-files` and `demo/data/manifest.js` |
| `npm test` | Jest tests for the core and the sources |
| `npm run typecheck` | core + Angular template type-check of the demo and library |
| `npm run build` | build the library with ng-packagr into `dist/` |

## Host requirements
- Angular 19+, `primeng` 19+, a PrimeNG theme (`providePrimeNG`), `provideAnimationsAsync()`, PrimeIcons CSS.
- **Tailwind**: the widgets use Tailwind utility classes. Add the library to your Tailwind `content`:
  `'./node_modules/stl-dms/dist/**/*.mjs'`.

## Not included (compared with the ERP Documents module)
- Linking a file to an ERP entity (Opportunity, Project, Tender, ...): that is ERP business data, not storage.
- Shared / My Documents scopes: a source is one tree; use two sources (or two folders) if you need both.

## License

MIT, see [LICENSE](LICENSE).
